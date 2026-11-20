import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { OrderStatus } from '@/shared/types'
import type { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import type { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import {
  MARKETPLACE_LABELS,
  isMarketplacePlatform,
  type MarketplaceAction,
  type MarketplaceEvent,
  type MarketplacePlatform,
} from '../domain/Marketplace'
import { actionForStatus, shouldSendAction } from '../domain/statusSync'
import type { MarketplaceConnection } from '../infra/marketplaceConfig'
import { buildOrderNotes, toOrderItems } from './marketplaceOrderInput'

type Database = NodePgDatabase<typeof schema>

export interface MarketplaceOrderServiceOptions {
  autoConfirm: boolean
}

/**
 * Coração da integração: transforma eventos das plataformas em pedidos do painel e devolve para a
 * plataforma o que a equipe faz no painel (aceitar, preparo, pronto, saiu, cancelar).
 */
export class MarketplaceOrderService {
  constructor(
    private readonly db: Database,
    private readonly connections: Map<MarketplacePlatform, MarketplaceConnection>,
    private readonly createOrder: Pick<CreateOrderUseCase, 'execute'>,
    private readonly updateStatus: () => Pick<UpdateOrderStatusUseCase, 'execute'>,
    private readonly options: MarketplaceOrderServiceOptions
  ) {}

  get enabledPlatforms(): MarketplacePlatform[] {
    return [...this.connections.keys()]
  }

  connection(platform: MarketplacePlatform): MarketplaceConnection | undefined {
    return this.connections.get(platform)
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
        console.error(`[Marketplaces] polling ${MARKETPLACE_LABELS[platform]} falhou:`, error instanceof Error ? error.message : error)
      }
    }
  }

  /**
   * Trata os eventos e devolve os que podem ser confirmados para a plataforma. Evento que falhou não
   * volta na lista: a plataforma manda de novo no próximo polling.
   */
  async handleEvents(platform: MarketplacePlatform, events: MarketplaceEvent[]): Promise<MarketplaceEvent[]> {
    const handled: MarketplaceEvent[] = []
    for (const event of events) {
      const [fresh] = await this.db
        .insert(schema.marketplaceEvents)
        .values({ platform, eventId: event.id, eventCode: event.code.slice(0, 40), externalOrderId: event.orderId })
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
          .where(and(eq(schema.marketplaceEvents.platform, platform), eq(schema.marketplaceEvents.eventId, event.id)))
        console.error(
          `[Marketplaces] evento ${event.code} do pedido ${event.orderId} (${MARKETPLACE_LABELS[platform]}) falhou:`,
          error instanceof Error ? error.message : error
        )
      }
    }
    return handled
  }

  private async handleEvent(platform: MarketplacePlatform, event: MarketplaceEvent): Promise<void> {
    switch (event.kind) {
      case 'placed':
        await this.importOrder(platform, event.orderId)
        return
      case 'cancelled':
        await this.cancelFromPlatform(platform, event.orderId)
        return
      case 'concluded':
        await this.setPlatformStatus(platform, event.orderId, 'concluded')
        return
      default:
        return
    }
  }

  /** Pedido novo: entra no painel e na cozinha com o preço da plataforma. Repetido não duplica. */
  async importOrder(platform: MarketplacePlatform, externalId: string): Promise<string> {
    const connection = this.connections.get(platform)
    if (!connection) throw new Error(`${platform} não está ligado`)

    const existing = await this.findLink(platform, externalId)
    if (existing?.orderId) return existing.orderId

    const order = await connection.provider.getOrder(externalId)
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
        merchantId: order.merchantId ?? null,
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
      await this.sendAction(platform, order.externalId, 'confirm').catch((error: unknown) =>
        console.error(`[Marketplaces] aceite automático falhou:`, error instanceof Error ? error.message : error)
      )
    }
    return created.id
  }

  /** Cancelado na plataforma (cliente, loja pelo portal ou a própria plataforma): cancela no painel. */
  async cancelFromPlatform(platform: MarketplacePlatform, externalId: string): Promise<void> {
    const link = await this.findLink(platform, externalId)
    await this.setPlatformStatus(platform, externalId, 'cancelled')
    if (!link?.orderId) return

    const order = await this.db.query.orders.findFirst({ where: eq(schema.orders.id, link.orderId) })
    if (!order || order.status === 'cancelled') return
    await this.updateStatus().execute({
      orderId: order.id,
      establishmentId: order.establishmentId,
      newStatus: 'cancelled',
      manual: true,
      cancellationReason: `Cancelado no ${MARKETPLACE_LABELS[platform]}`,
      note: `Cancelado no ${MARKETPLACE_LABELS[platform]}`,
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
      if (link.platformStatus === 'cancelled' || link.platformStatus === 'concluded') return
      await this.connections.get(platform)!.provider.requestCancellation(link.externalId, order.cancellationReason ?? 'Cancelado pelo restaurante')
      await this.setPlatformStatus(platform, link.externalId, 'cancellation_requested')
      return
    }

    const action = actionForStatus(newStatus, link.deliveredBy)
    if (!action || !shouldSendAction(link.platformStatus, action)) return
    // Aceite manual: o primeiro passo do painel também aceita na plataforma.
    if (link.platformStatus === 'placed') await this.sendAction(platform, link.externalId, 'confirm')
    await this.sendAction(platform, link.externalId, action, link.deliveredBy)
  }

  private async sendAction(
    platform: MarketplacePlatform,
    externalId: string,
    action: MarketplaceAction,
    deliveredBy: string | null = null
  ): Promise<void> {
    await this.connections.get(platform)!.provider.sendAction(externalId, action, { deliveredBy })
    await this.setPlatformStatus(platform, externalId, action)
  }

  private async findLink(platform: MarketplacePlatform, externalId: string) {
    const [link] = await this.db
      .select()
      .from(schema.marketplaceOrders)
      .where(and(eq(schema.marketplaceOrders.platform, platform), eq(schema.marketplaceOrders.externalId, externalId)))
      .limit(1)
    return link
  }

  private async setPlatformStatus(platform: MarketplacePlatform, externalId: string, status: string): Promise<void> {
    await this.db
      .update(schema.marketplaceOrders)
      .set({ platformStatus: status, updatedAt: new Date() })
      .where(and(eq(schema.marketplaceOrders.platform, platform), eq(schema.marketplaceOrders.externalId, externalId)))
  }
}
