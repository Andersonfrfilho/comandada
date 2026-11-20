import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { OrderStatus } from '@/shared/types'
import { AppError, NotFoundError, ValidationError } from '@/shared/errors/AppError'
import type { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import type { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import {
  MARKETPLACE_LABELS,
  MarketplaceApiError,
  isMarketplacePlatform,
  type MarketplaceAction,
  type MarketplaceCancellationReason,
  type MarketplaceDateRange,
  type MarketplaceDispute,
  type MarketplaceDisputeResponse,
  type MarketplaceEvent,
  type MarketplaceOrderContext,
  type MarketplacePlatform,
  type MarketplaceReviewPage,
  type MarketplaceReviewSummary,
  type MarketplaceSale,
  type MarketplaceSettlement,
} from '../domain/Marketplace'
import { actionForStatus, actionsToSend } from '../domain/statusSync'
import type { MarketplaceConnection } from '../infra/marketplaceConfig'
import { buildOrderNotes, toOrderItems } from './marketplaceOrderInput'

type Database = NodePgDatabase<typeof schema>
type MarketplaceOrderLink = typeof schema.marketplaceOrders.$inferSelect
type MarketplaceDisputeRow = typeof schema.marketplaceDisputes.$inferSelect

export interface MarketplaceOrderServiceOptions {
  autoConfirm: boolean
}

/** Avisos em tempo real para o painel (negociação aberta, cancelamento recusado). */
export interface MarketplaceAlerts {
  publishBroadcast(establishmentId: string, type: string, payload?: unknown): Promise<void>
}

export const MARKETPLACE_WS_EVENTS = {
  DISPUTE_OPENED: 'marketplace:dispute_opened',
  DISPUTE_UPDATED: 'marketplace:dispute_updated',
  CANCELLATION_FAILED: 'marketplace:cancellation_failed',
} as const

/** O iFood pode demorar a liberar o detalhe do pedido novo: 404 vale nova tentativa por 10 min. */
const ORDER_NOT_READY_WINDOW_MS = 10 * 60 * 1000
/** Período máximo de uma consulta financeira no painel (vira várias consultas na plataforma). */
const MAX_FINANCIAL_RANGE_DAYS = 93

export interface MarketplaceDisputeView {
  id: string
  platform: MarketplacePlatform
  orderId: string | null
  externalOrderId: string
  kind: string
  message: string | null
  expiresAt: string | null
  /** open, responded, accepted, rejected, expired… */
  status: string
  dispute: MarketplaceDispute
  response: unknown
  createdAt: string
}

export interface MarketplaceOrderView {
  platform: MarketplacePlatform
  label: string
  externalId: string
  displayId: string | null
  platformStatus: string
  deliveredBy: string | null
  /** Plataforma ligada agora (sem ela, cancelar e responder ficam no portal da plataforma). */
  connected: boolean
  disputes: MarketplaceDisputeView[]
}

export interface MarketplaceFinancialResult<T> {
  platforms: MarketplacePlatform[]
  items: T[]
  /** Plataforma ligada que falhou na consulta (o resto aparece). */
  errors: Array<{ platform: MarketplacePlatform; message: string }>
}

/**
 * Coração da integração: transforma eventos das plataformas em pedidos do painel e devolve para a
 * plataforma o que a equipe faz no painel (aceitar, preparo, pronto, saiu, cancelar), além das
 * negociações, do financeiro e das avaliações.
 */
export class MarketplaceOrderService {
  constructor(
    private readonly db: Database,
    private readonly connections: Map<MarketplacePlatform, MarketplaceConnection>,
    private readonly createOrder: Pick<CreateOrderUseCase, 'execute'>,
    private readonly updateStatus: () => Pick<UpdateOrderStatusUseCase, 'execute'>,
    private readonly options: MarketplaceOrderServiceOptions,
    private readonly alerts?: MarketplaceAlerts | undefined,
    private readonly now: () => Date = () => new Date()
  ) {}

  get enabledPlatforms(): MarketplacePlatform[] {
    return [...this.connections.keys()]
  }

  connection(platform: MarketplacePlatform): MarketplaceConnection | undefined {
    return this.connections.get(platform)
  }

  /** Plataformas ligadas a este restaurante. */
  platformsFor(establishmentId: string): MarketplacePlatform[] {
    return [...this.connections.entries()]
      .filter(([, connection]) => connection.establishmentId === establishmentId)
      .map(([platform]) => platform)
  }

  /** Um ciclo de polling: busca, trata e confirma o recebimento. Erro numa plataforma não para a outra. */
  async pollAll(): Promise<void> {
    for (const [platform, connection] of this.connections) {
      try {
        const events = await connection.provider.pollEvents()
        if (events.length === 0) continue
        const handled = await this.handleEvents(platform, events)
        await connection.provider.acknowledge(handled)
      } catch (error) {
        console.error(`[Marketplaces] polling ${MARKETPLACE_LABELS[platform]} falhou:`, errorMessage(error))
      }
    }
  }

  /**
   * Trata os eventos e devolve os que podem ser confirmados para a plataforma. Evento que falhou não
   * volta na lista: a plataforma manda de novo no próximo polling (ou reenvia o webhook).
   */
  async handleEvents(platform: MarketplacePlatform, events: MarketplaceEvent[]): Promise<MarketplaceEvent[]> {
    const handled: MarketplaceEvent[] = []
    for (const event of events) {
      const [fresh] = await this.db
        .insert(schema.marketplaceEvents)
        .values({ platform, eventId: event.id.slice(0, 100), eventCode: event.code.slice(0, 40), externalOrderId: event.orderId })
        .onConflictDoNothing()
        .returning({ eventId: schema.marketplaceEvents.eventId })
      if (!fresh) {
        handled.push(event)
        continue
      }
      try {
        await this.handleEvent(platform, event)
        handled.push(event)
      } catch (error) {
        await this.db
          .delete(schema.marketplaceEvents)
          .where(and(eq(schema.marketplaceEvents.platform, platform), eq(schema.marketplaceEvents.eventId, event.id.slice(0, 100))))
        console.error(
          `[Marketplaces] evento ${event.code} do pedido ${event.orderId} (${MARKETPLACE_LABELS[platform]}) falhou:`,
          errorMessage(error)
        )
      }
    }
    return handled
  }

  private async handleEvent(platform: MarketplacePlatform, event: MarketplaceEvent): Promise<void> {
    const label = MARKETPLACE_LABELS[platform]
    switch (event.kind) {
      case 'placed':
        await this.importPlacedOrder(platform, event)
        return
      case 'confirmed':
        await this.advancePlatformStatus(platform, event.orderId, 'confirmed')
        return
      case 'cancelled':
        await this.cancelFromPlatform(platform, event.orderId, reasonFrom(event))
        return
      case 'concluded':
        await this.setPlatformStatus(platform, event.orderId, 'concluded')
        return
      case 'cancellation_failed':
        await this.cancellationFailed(platform, event)
        return
      case 'dispute_opened':
        await this.openDispute(platform, event)
        return
      case 'dispute_settled':
        await this.settleDispute(platform, event)
        return
      case 'order_patched':
        await this.orderPatched(platform, event)
        return
      case 'address_changed':
        await this.appendNoteByExternalId(platform, event.orderId, `Endereço alterado no ${label}${describeAddress(event.metadata)}`)
        return
      default:
        return
    }
  }

  /** Pedido novo. 404 logo depois do evento é a plataforma ainda montando o pedido: tenta de novo. */
  private async importPlacedOrder(platform: MarketplacePlatform, event: MarketplaceEvent): Promise<void> {
    try {
      await this.importOrder(platform, event.orderId, event.merchantId)
    } catch (error) {
      const notFound = error instanceof MarketplaceApiError && error.status === 404
      const createdAt = event.createdAt ? Date.parse(event.createdAt) : Number.NaN
      const tooOld = Number.isFinite(createdAt) && this.now().getTime() - createdAt > ORDER_NOT_READY_WINDOW_MS
      if (notFound && tooOld) {
        console.error(`[Marketplaces] pedido ${event.orderId} (${MARKETPLACE_LABELS[platform]}) não apareceu em 10 min: desistindo`)
        return
      }
      throw error
    }
  }

  /** Pedido novo: entra no painel e na cozinha com o preço da plataforma. Repetido não duplica. */
  async importOrder(platform: MarketplacePlatform, externalId: string, merchantId?: string | undefined): Promise<string> {
    const connection = this.connections.get(platform)
    if (!connection) throw new Error(`${platform} não está ligado`)

    const existing = await this.findLink(platform, externalId)
    if (existing?.orderId) return existing.orderId

    const order = await connection.provider.getOrder(externalId, { merchantId })
    const establishmentId = connection.establishmentId
    const products = await this.db
      .select({ id: schema.products.id, name: schema.products.name, barcode: schema.products.barcode })
      .from(schema.products)
      .where(and(eq(schema.products.establishmentId, establishmentId), eq(schema.products.active, true)))

    const merchantDelivers = order.type === 'delivery' && order.deliveredBy === 'merchant' && order.deliveryAddress
    const created = await this.createOrder.execute({
      establishmentId,
      channel: platform,
      // Mesa/consumo no local pela plataforma vira retirada: não há mesa nem comanda do restaurante.
      type: order.type === 'table' ? 'pickup' : order.type,
      items: toOrderItems(order, products),
      notes: buildOrderNotes(order),
      customerName: order.customerName,
      code: order.displayId,
      whatsappMessageId: `${platform}:${order.externalId}`,
      ...(order.scheduledFor ? { scheduledFor: order.scheduledFor } : {}),
      // Entrega própria: entra em Entregas com a taxa que a plataforma cobrou. Entregador da plataforma: não.
      ...(merchantDelivers
        ? {
            delivery: {
              address: order.deliveryAddress!.formatted,
              complement: order.deliveryAddress!.complement,
              feeAmount: order.deliveryFee,
            },
          }
        : {}),
    })

    await this.db
      .insert(schema.marketplaceOrders)
      .values({
        establishmentId,
        platform,
        externalId: order.externalId,
        displayId: order.displayId,
        merchantId: order.merchantId ?? merchantId ?? null,
        orderId: created.id,
        platformStatus: 'placed',
        deliveredBy: order.deliveredBy,
        payload: order,
      })
      .onConflictDoUpdate({
        target: [schema.marketplaceOrders.platform, schema.marketplaceOrders.externalId],
        set: { orderId: created.id, updatedAt: new Date() },
      })

    console.log(`[Marketplaces] ${MARKETPLACE_LABELS[platform]} #${order.displayId} entrou como pedido #${created.number}`)

    if (this.options.autoConfirm) {
      const link = await this.findLink(platform, order.externalId)
      if (link) {
        await this.sendActions(link, ['confirm'], { type: order.type }).catch((error: unknown) =>
          console.error(`[Marketplaces] aceite automático falhou:`, errorMessage(error))
        )
      }
    }
    return created.id
  }

  /** Cancelado na plataforma (cliente, loja pelo portal ou a própria plataforma): cancela no painel. */
  async cancelFromPlatform(platform: MarketplacePlatform, externalId: string, reason?: string | undefined): Promise<void> {
    const link = await this.findLink(platform, externalId)
    await this.setPlatformStatus(platform, externalId, 'cancelled')
    if (!link?.orderId) return

    const order = await this.db.query.orders.findFirst({ where: eq(schema.orders.id, link.orderId) })
    if (!order || order.status === 'cancelled') return
    const text = `Cancelado no ${MARKETPLACE_LABELS[platform]}${reason ? `: ${reason}` : ''}`
    await this.updateStatus().execute({
      orderId: order.id,
      establishmentId: order.establishmentId,
      newStatus: 'cancelled',
      manual: true,
      cancellationReason: text.slice(0, 500),
      note: text.slice(0, 500),
    })
  }

  /**
   * Chamado depois de toda mudança de status no painel. Pedido de outro canal ou plataforma desligada:
   * não faz nada. Falha aqui só vai para o log: o painel não desfaz o que a cozinha fez.
   */
  async onOrderStatusChanged(order: schema.Order, newStatus: OrderStatus): Promise<void> {
    if (!isMarketplacePlatform(order.channel)) return
    const platform = order.channel
    if (!this.connections.has(platform)) return

    const [link] = await this.db
      .select()
      .from(schema.marketplaceOrders)
      .where(eq(schema.marketplaceOrders.orderId, order.id))
      .limit(1)
    if (!link) return

    if (newStatus === 'cancelled') {
      if (['cancelled', 'concluded', 'cancellation_requested'].includes(link.platformStatus)) return
      await this.connections
        .get(platform)!
        .provider.requestCancellation(link.externalId, { reason: order.cancellationReason ?? 'Cancelado pelo restaurante' }, contextOf(link, order.type))
      await this.setPlatformStatus(platform, link.externalId, 'cancellation_requested')
      return
    }

    const action = actionForStatus(newStatus, { deliveredBy: link.deliveredBy, type: order.type })
    if (!action) return
    const steps = actionsToSend(link.platformStatus, action)
    if (steps.length === 0) return
    const courier = steps.includes('dispatch') ? await this.courierFor(order) : undefined
    await this.sendActions(link, steps, { type: order.type, courier })
  }

  // ------------------------------------------------------------------ painel: pedido e cancelamento

  async orderView(establishmentId: string, orderId: string): Promise<MarketplaceOrderView | null> {
    const link = await this.linkForOrder(establishmentId, orderId)
    if (!link || !isMarketplacePlatform(link.platform)) return null
    const disputes = await this.db
      .select()
      .from(schema.marketplaceDisputes)
      .where(eq(schema.marketplaceDisputes.orderId, orderId))
      .orderBy(desc(schema.marketplaceDisputes.createdAt))
    return {
      platform: link.platform,
      label: MARKETPLACE_LABELS[link.platform],
      externalId: link.externalId,
      displayId: link.displayId,
      platformStatus: link.platformStatus,
      deliveredBy: link.deliveredBy,
      connected: this.connections.get(link.platform)?.establishmentId === establishmentId,
      disputes: disputes.map((row) => this.disputeView(row)),
    }
  }

  /** Motivos que a plataforma aceita agora. Lista vazia: o pedido não pode mais ser cancelado por aqui. */
  async cancellationReasons(establishmentId: string, orderId: string): Promise<MarketplaceCancellationReason[]> {
    const { link, connection, order } = await this.requireOrderLink(establishmentId, orderId)
    return connection.provider.cancellationReasons(link.externalId, contextOf(link, order.type))
  }

  /**
   * Pede o cancelamento na plataforma com o motivo escolhido. O pedido continua aberto no painel até a
   * plataforma confirmar (o evento de cancelado fecha aqui); se ela recusar, o painel recebe o aviso.
   */
  async cancelOnPlatform(
    establishmentId: string,
    orderId: string,
    cancellation: { code: string; reason: string }
  ): Promise<void> {
    const { link, connection, order } = await this.requireOrderLink(establishmentId, orderId)
    if (link.platformStatus === 'cancelled' || link.platformStatus === 'concluded') {
      throw new AppError('Este pedido já foi encerrado na plataforma', 'marketplace_order_closed', 409)
    }
    await connection.provider.requestCancellation(link.externalId, cancellation, contextOf(link, order.type))
    await this.setPlatformStatus(link.platform as MarketplacePlatform, link.externalId, 'cancellation_requested')
    await this.appendNote(orderId, `Cancelamento pedido ao ${MARKETPLACE_LABELS[link.platform as MarketplacePlatform]}: ${cancellation.reason}`)
  }

  // ------------------------------------------------------------------ negociações

  async listDisputes(establishmentId: string, options: { openOnly?: boolean | undefined } = {}): Promise<MarketplaceDisputeView[]> {
    const rows = await this.db
      .select()
      .from(schema.marketplaceDisputes)
      .where(
        options.openOnly
          ? and(eq(schema.marketplaceDisputes.establishmentId, establishmentId), eq(schema.marketplaceDisputes.status, 'open'))
          : eq(schema.marketplaceDisputes.establishmentId, establishmentId)
      )
      .orderBy(desc(schema.marketplaceDisputes.createdAt))
      .limit(100)
    const views = rows.map((row) => this.disputeView(row))
    return options.openOnly ? views.filter((view) => view.status === 'open') : views
  }

  async respondDispute(
    establishmentId: string,
    disputeId: string,
    response: MarketplaceDisputeResponse,
    userId: string | undefined
  ): Promise<MarketplaceDisputeView> {
    const [row] = await this.db
      .select()
      .from(schema.marketplaceDisputes)
      .where(and(eq(schema.marketplaceDisputes.id, disputeId), eq(schema.marketplaceDisputes.establishmentId, establishmentId)))
      .limit(1)
    if (!row || !isMarketplacePlatform(row.platform)) throw new NotFoundError('negociação')
    const view = this.disputeView(row)
    if (view.status !== 'open') throw new AppError('Esta negociação não está mais aberta', 'marketplace_dispute_closed', 409)
    const connection = this.connections.get(row.platform)
    if (!connection || connection.establishmentId !== establishmentId) throw new NotFoundError('negociação')

    const dispute = row.payload as MarketplaceDispute
    if (response.decision === 'alternative' && !dispute.alternatives.some((alternative) => alternative.id === response.alternativeId)) {
      throw new ValidationError('Proposta não existe nesta negociação')
    }
    const link = await this.findLink(row.platform, row.externalOrderId)
    await connection.provider.respondDispute(dispute, response, link ? contextOf(link) : {})

    const [updated] = await this.db
      .update(schema.marketplaceDisputes)
      .set({ status: 'responded', response, respondedBy: userId ?? null, updatedAt: new Date() })
      .where(eq(schema.marketplaceDisputes.id, row.id))
      .returning()
    if (row.orderId) await this.appendNote(row.orderId, `Negociação ${MARKETPLACE_LABELS[row.platform]}: ${describeResponse(response)}`)
    await this.alerts?.publishBroadcast(establishmentId, MARKETPLACE_WS_EVENTS.DISPUTE_UPDATED, { id: row.id, orderId: row.orderId })
    return this.disputeView(updated!)
  }

  private async openDispute(platform: MarketplacePlatform, event: MarketplaceEvent): Promise<void> {
    const connection = this.connections.get(platform)!
    const dispute = connection.provider.parseDispute(event)
    if (!dispute) return
    const link = await this.findLink(platform, dispute.orderExternalId)
    const [row] = await this.db
      .insert(schema.marketplaceDisputes)
      .values({
        establishmentId: connection.establishmentId,
        platform,
        externalId: dispute.externalId.slice(0, 120),
        orderId: link?.orderId ?? null,
        externalOrderId: dispute.orderExternalId,
        kind: dispute.kind,
        message: dispute.message ?? null,
        expiresAt: dispute.expiresAt ? new Date(dispute.expiresAt) : null,
        payload: dispute,
      })
      .onConflictDoNothing()
      .returning()
    if (!row) return
    if (row.orderId) {
      await this.appendNote(row.orderId, `${MARKETPLACE_LABELS[platform]}: cliente abriu negociação (${DISPUTE_KIND_LABELS[dispute.kind] ?? dispute.kind})${dispute.message ? ` — ${dispute.message}` : ''}`)
    }
    await this.alerts?.publishBroadcast(connection.establishmentId, MARKETPLACE_WS_EVENTS.DISPUTE_OPENED, {
      id: row.id,
      orderId: row.orderId,
      platform,
      kind: dispute.kind,
      displayId: link?.displayId ?? null,
      expiresAt: dispute.expiresAt ?? null,
    })
  }

  private async settleDispute(platform: MarketplacePlatform, event: MarketplaceEvent): Promise<void> {
    const connection = this.connections.get(platform)!
    const settlement = connection.provider.parseDisputeSettlement(event)
    if (!settlement) return
    const [row] = await this.db
      .update(schema.marketplaceDisputes)
      .set({ status: settlement.status.slice(0, 20), updatedAt: new Date() })
      .where(and(eq(schema.marketplaceDisputes.platform, platform), eq(schema.marketplaceDisputes.externalId, settlement.disputeExternalId.slice(0, 120))))
      .returning()
    if (!row) return
    if (row.orderId) await this.appendNote(row.orderId, `Negociação ${MARKETPLACE_LABELS[platform]} encerrada: ${SETTLEMENT_LABELS[settlement.status] ?? settlement.status}`)
    await this.alerts?.publishBroadcast(row.establishmentId, MARKETPLACE_WS_EVENTS.DISPUTE_UPDATED, { id: row.id, orderId: row.orderId })
  }

  private async cancellationFailed(platform: MarketplacePlatform, event: MarketplaceEvent): Promise<void> {
    const link = await this.findLink(platform, event.orderId)
    if (!link) return
    // Volta para "aceito": o pedido segue valendo na plataforma e os próximos avisos de status saem.
    await this.setPlatformStatus(platform, event.orderId, 'confirmed')
    const reason = reasonFrom(event)
    if (link.orderId) {
      await this.appendNote(link.orderId, `${MARKETPLACE_LABELS[platform]} recusou o cancelamento${reason ? `: ${reason}` : ''}. O pedido continua valendo lá.`)
    }
    await this.alerts?.publishBroadcast(link.establishmentId, MARKETPLACE_WS_EVENTS.CANCELLATION_FAILED, {
      orderId: link.orderId,
      platform,
      displayId: link.displayId,
      reason: reason ?? null,
    })
  }

  /** Itens ou valores mudaram na plataforma: guarda a versão nova e avisa no pedido. */
  private async orderPatched(platform: MarketplacePlatform, event: MarketplaceEvent): Promise<void> {
    const link = await this.findLink(platform, event.orderId)
    if (!link) return
    const order = await this.connections.get(platform)!.provider.getOrder(event.orderId, contextOf(link))
    await this.db
      .update(schema.marketplaceOrders)
      .set({ payload: order, updatedAt: new Date() })
      .where(eq(schema.marketplaceOrders.id, link.id))
    if (link.orderId) {
      const items = order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')
      await this.appendNote(
        link.orderId,
        `Pedido alterado no ${MARKETPLACE_LABELS[platform]}. Agora: ${items} · total R$ ${order.orderAmount.toFixed(2).replace('.', ',')}`
      )
    }
  }

  // ------------------------------------------------------------------ financeiro e avaliações

  async financialSales(
    establishmentId: string,
    range: MarketplaceDateRange,
    platform?: MarketplacePlatform | undefined
  ): Promise<MarketplaceFinancialResult<MarketplaceSale>> {
    const result = await this.collectFinancial(establishmentId, range, platform, (financial, merchantId, chunk) =>
      financial.listSales(merchantId, chunk)
    )
    result.items.sort((a, b) => b.date.localeCompare(a.date))
    return result
  }

  async financialSettlements(
    establishmentId: string,
    range: MarketplaceDateRange,
    platform?: MarketplacePlatform | undefined
  ): Promise<MarketplaceFinancialResult<MarketplaceSettlement>> {
    const result = await this.collectFinancial(establishmentId, range, platform, (financial, merchantId, chunk) =>
      financial.listSettlements(merchantId, chunk)
    )
    const unique = new Map(result.items.map((item) => [`${item.platform}:${item.merchantId}:${item.id}`, item]))
    result.items = [...unique.values()].sort((a, b) => (b.paymentDate ?? '').localeCompare(a.paymentDate ?? ''))
    return result
  }

  private async collectFinancial<T>(
    establishmentId: string,
    range: MarketplaceDateRange,
    platform: MarketplacePlatform | undefined,
    fetchChunk: (
      financial: NonNullable<MarketplaceConnection['provider']['financial']>,
      merchantId: string,
      chunk: MarketplaceDateRange
    ) => Promise<T[]>
  ): Promise<MarketplaceFinancialResult<T>> {
    validateRange(range)
    const platforms = this.platformsFor(establishmentId).filter(
      (candidate) => (!platform || candidate === platform) && this.connections.get(candidate)!.provider.financial
    )
    const result: MarketplaceFinancialResult<T> = { platforms, items: [], errors: [] }
    for (const candidate of platforms) {
      const connection = this.connections.get(candidate)!
      const financial = connection.provider.financial!
      try {
        for (const merchantId of connection.merchantIds) {
          for (const chunk of splitRange(range, financial.maxRangeDays)) {
            result.items.push(...(await fetchChunk(financial, merchantId, chunk)))
          }
        }
      } catch (error) {
        console.error(`[Marketplaces] financeiro ${MARKETPLACE_LABELS[candidate]} falhou:`, errorMessage(error))
        result.errors.push({ platform: candidate, message: `Não foi possível consultar o ${MARKETPLACE_LABELS[candidate]} agora` })
      }
    }
    return result
  }

  /** Plataformas deste restaurante com avaliações pela API (hoje só o iFood). */
  reviewPlatforms(establishmentId: string): Array<{ platform: MarketplacePlatform; label: string; policyUrl: string; merchantIds: string[] }> {
    return this.platformsFor(establishmentId).flatMap((platform) => {
      const connection = this.connections.get(platform)!
      const reviews = connection.provider.reviews
      return reviews ? [{ platform, label: MARKETPLACE_LABELS[platform], policyUrl: reviews.policyUrl, merchantIds: connection.merchantIds }] : []
    })
  }

  async listReviews(
    establishmentId: string,
    platform: MarketplacePlatform,
    options: { merchantId?: string | undefined; page: number; pageSize: number; dateFrom?: string | undefined; dateTo?: string | undefined }
  ): Promise<MarketplaceReviewPage> {
    const { reviews, merchantId } = this.reviewTarget(establishmentId, platform, options.merchantId)
    return reviews.list(merchantId, { ...options })
  }

  async reviewSummary(establishmentId: string, platform: MarketplacePlatform, merchantId?: string | undefined): Promise<MarketplaceReviewSummary> {
    const target = this.reviewTarget(establishmentId, platform, merchantId)
    return target.reviews.summary(target.merchantId)
  }

  async answerReview(
    establishmentId: string,
    platform: MarketplacePlatform,
    reviewId: string,
    text: string,
    merchantId?: string | undefined
  ): Promise<void> {
    const trimmed = text.trim()
    if (trimmed.length < 10 || trimmed.length > 300) throw new ValidationError('A resposta precisa ter de 10 a 300 caracteres')
    const target = this.reviewTarget(establishmentId, platform, merchantId)
    await target.reviews.answer(target.merchantId, reviewId, trimmed)
  }

  private reviewTarget(establishmentId: string, platform: MarketplacePlatform, merchantId?: string | undefined) {
    const connection = this.connections.get(platform)
    const reviews = connection?.provider.reviews
    if (!connection || connection.establishmentId !== establishmentId || !reviews) throw new NotFoundError('avaliações da plataforma')
    const chosen = merchantId ?? connection.merchantIds[0]
    if (!chosen || !connection.merchantIds.includes(chosen)) throw new NotFoundError('loja na plataforma')
    return { reviews, merchantId: chosen }
  }

  // ------------------------------------------------------------------ apoio

  private async sendActions(
    link: MarketplaceOrderLink,
    steps: MarketplaceAction[],
    extra: { type?: string | null | undefined; courier?: MarketplaceOrderContext['courier'] }
  ): Promise<void> {
    const provider = this.connections.get(link.platform as MarketplacePlatform)!.provider
    const context = { ...contextOf(link, extra.type), courier: extra.courier }
    for (const step of steps) {
      await provider.sendAction(link.externalId, step, context)
      await this.setPlatformStatus(link.platform as MarketplacePlatform, link.externalId, step)
    }
  }

  /** Entregador do restaurante para a 99Food: quem está na entrega, senão o próprio restaurante. */
  private async courierFor(order: schema.Order): Promise<MarketplaceOrderContext['courier']> {
    const [delivery] = await this.db
      .select({ name: schema.users.name })
      .from(schema.deliveries)
      .innerJoin(schema.users, eq(schema.users.id, schema.deliveries.delivererId))
      .where(eq(schema.deliveries.orderId, order.id))
      .limit(1)
    const establishment = await this.db.query.establishments.findFirst({ where: eq(schema.establishments.id, order.establishmentId) })
    const name = delivery?.name ?? establishment?.name ?? 'Entregador da loja'
    return { name, phone: establishment?.whatsappNumber ?? null }
  }

  private async requireOrderLink(establishmentId: string, orderId: string) {
    const link = await this.linkForOrder(establishmentId, orderId)
    const platform = link?.platform
    const connection = platform && isMarketplacePlatform(platform) ? this.connections.get(platform) : undefined
    if (!link || !connection) throw new NotFoundError('pedido de marketplace')
    const order = await this.db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) })
    if (!order) throw new NotFoundError('pedido')
    return { link, connection, order }
  }

  private async linkForOrder(establishmentId: string, orderId: string): Promise<MarketplaceOrderLink | undefined> {
    const [link] = await this.db
      .select()
      .from(schema.marketplaceOrders)
      .where(and(eq(schema.marketplaceOrders.orderId, orderId), eq(schema.marketplaceOrders.establishmentId, establishmentId)))
      .limit(1)
    return link
  }

  private disputeView(row: MarketplaceDisputeRow): MarketplaceDisputeView {
    const expired = row.status === 'open' && row.expiresAt !== null && row.expiresAt.getTime() < this.now().getTime()
    return {
      id: row.id,
      platform: row.platform as MarketplacePlatform,
      orderId: row.orderId,
      externalOrderId: row.externalOrderId,
      kind: row.kind,
      message: row.message,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      status: expired ? 'expired' : row.status,
      dispute: row.payload as MarketplaceDispute,
      response: row.response,
      createdAt: row.createdAt.toISOString(),
    }
  }

  private async appendNoteByExternalId(platform: MarketplacePlatform, externalId: string, note: string): Promise<void> {
    const link = await this.findLink(platform, externalId)
    if (link?.orderId) await this.appendNote(link.orderId, note)
  }

  /** Acrescenta uma linha às observações do pedido (cozinha e painel mostram). */
  private async appendNote(orderId: string, note: string): Promise<void> {
    await this.db
      .update(schema.orders)
      .set({ notes: sql`concat_ws(E'\n', nullif(${schema.orders.notes}, ''), ${note.slice(0, 500)}::text)` })
      .where(eq(schema.orders.id, orderId))
  }

  private async findLink(platform: MarketplacePlatform, externalId: string): Promise<MarketplaceOrderLink | undefined> {
    const [link] = await this.db
      .select()
      .from(schema.marketplaceOrders)
      .where(and(eq(schema.marketplaceOrders.platform, platform), eq(schema.marketplaceOrders.externalId, externalId)))
      .limit(1)
    return link
  }

  /** "Aceito" que chega da plataforma só avança: não volta um pedido que já está em preparo. */
  private async advancePlatformStatus(platform: MarketplacePlatform, externalId: string, status: string): Promise<void> {
    await this.db
      .update(schema.marketplaceOrders)
      .set({ platformStatus: status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.marketplaceOrders.platform, platform),
          eq(schema.marketplaceOrders.externalId, externalId),
          inArray(schema.marketplaceOrders.platformStatus, ['placed'])
        )
      )
  }

  private async setPlatformStatus(platform: MarketplacePlatform, externalId: string, status: string): Promise<void> {
    await this.db
      .update(schema.marketplaceOrders)
      .set({ platformStatus: status, updatedAt: new Date() })
      .where(and(eq(schema.marketplaceOrders.platform, platform), eq(schema.marketplaceOrders.externalId, externalId)))
  }
}

const DISPUTE_KIND_LABELS: Record<string, string> = {
  cancellation: 'cancelamento',
  partial_cancellation: 'cancelamento de itens',
  refund: 'reembolso',
  delay: 'atraso',
  other: 'outro assunto',
}

const SETTLEMENT_LABELS: Record<string, string> = {
  accepted: 'aceita',
  rejected: 'recusada',
  alternative_replied: 'cliente respondeu à proposta',
  expired: 'prazo vencido',
}

function contextOf(link: MarketplaceOrderLink, type?: string | null | undefined): MarketplaceOrderContext {
  return { merchantId: link.merchantId, deliveredBy: link.deliveredBy, type: type ?? undefined }
}

function reasonFrom(event: MarketplaceEvent): string | undefined {
  const metadata = event.metadata ?? {}
  for (const key of ['reason', 'cancellationReason', 'cancel_reason', 'message', 'description']) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 300)
  }
  return undefined
}

function describeAddress(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return ''
  const address = (metadata['address'] ?? metadata['deliveryAddress'] ?? metadata) as Record<string, unknown>
  const formatted = address['formattedAddress'] ?? address['formatted'] ?? address['address']
  return typeof formatted === 'string' && formatted.trim() ? `: ${formatted.trim().slice(0, 300)}` : '. Confira na plataforma.'
}

function describeResponse(response: MarketplaceDisputeResponse): string {
  switch (response.decision) {
    case 'accept':
      return 'aceita pela equipe'
    case 'reject':
      return `recusada pela equipe (${response.reason})`
    case 'alternative':
      if (response.amount !== undefined) return `proposta de reembolso de R$ ${response.amount.toFixed(2).replace('.', ',')}`
      if (response.minutes !== undefined) return `proposta de mais ${response.minutes} min`
      return 'proposta enviada'
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validateRange(range: MarketplaceDateRange): void {
  if (!DATE_PATTERN.test(range.from) || !DATE_PATTERN.test(range.to)) throw new ValidationError('Datas no formato AAAA-MM-DD')
  const days = dayDiff(range.from, range.to)
  if (days < 0) throw new ValidationError('A data inicial vem depois da final')
  if (days + 1 > MAX_FINANCIAL_RANGE_DAYS) throw new ValidationError(`Escolha um período de até ${MAX_FINANCIAL_RANGE_DAYS} dias`)
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Quebra o período em pedaços do tamanho que a plataforma aceita. */
export function splitRange(range: MarketplaceDateRange, maxDays: number): MarketplaceDateRange[] {
  const chunks: MarketplaceDateRange[] = []
  let start = Date.parse(`${range.from}T00:00:00Z`)
  const end = Date.parse(`${range.to}T00:00:00Z`)
  while (start <= end) {
    const chunkEnd = Math.min(end, start + (maxDays - 1) * 86_400_000)
    chunks.push({ from: new Date(start).toISOString().slice(0, 10), to: new Date(chunkEnd).toISOString().slice(0, 10) })
    start = chunkEnd + 86_400_000
  }
  return chunks
}
