/**
 * Pede ao cliente que confirme o pedido apenas com os itens disponíveis.
 *
 * O caso de uso **não altera o pedido**: ele envia a pergunta, guarda quais itens faltaram
 * (`order_partial_confirmations`, pendente) e registra a auditoria. A resposta SIM/NÃO chega pelo
 * bot e é aplicada por `AnswerPartialConfirmationUseCase`.
 */

import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { PartialSubstitution } from '@/infra/database/schema'
import { MAX_SUBSTITUTES } from '../../domain/substituteRanking'
import { NotFoundError, ValidationError } from '@/shared/errors/AppError'
import type { CustomerMessageProvider } from '@/shared/providers/CustomerMessageProvider'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { OrderSubstituteCatalog } from '../services/OrderSubstituteCatalog'
import {
  ORDER_CLOSED_STATUSES,
  ORDER_ERROR_MESSAGES,
  ORDER_RESOURCE_TYPE,
  PARTIAL_CONFIRMATION_AUDIT_ACTION,
  PARTIAL_CONFIRMATION_MESSAGES,
  PARTIAL_CONFIRMATION_STATUS,
} from '../../shared/orders.constant'

type Database = NodePgDatabase<typeof schema>

export type RequestPartialOrderConfirmationParams = {
  readonly orderId: string
  readonly establishmentId: string
  readonly userId: string
  readonly unavailableItemIds: readonly string[]
  /** Troca sugerida para itens em falta; item sem entrada aqui só sai do pedido. */
  readonly substitutions?: ReadonlyArray<{ readonly itemId: string; readonly productId: string }> | undefined
}

export type RequestPartialOrderConfirmationResult = {
  readonly message: string
  readonly whatsappNumber: string
}

type OrderItemLine = {
  readonly id: string
  readonly productName: string
  readonly quantity: number
  readonly totalPrice: string
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatItemLine(item: OrderItemLine): string {
  return `• ${item.quantity}× ${item.productName}`
}

export type MessageSubstitute = { readonly productName: string; readonly unitPrice: number }

export function buildPartialConfirmationMessage(params: {
  readonly customerName: string | null
  readonly unavailableItems: readonly OrderItemLine[]
  readonly remainingItems: readonly OrderItemLine[]
  /** Item em falta (id) → produto sugerido no lugar. */
  readonly substitutes?: ReadonlyMap<string, MessageSubstitute> | undefined
}): string {
  const substitutes = params.substitutes ?? new Map<string, MessageSubstitute>()
  const substitutedTotal = params.unavailableItems.reduce((total, item) => {
    const substitute = substitutes.get(item.id)
    return substitute ? total + substitute.unitPrice * item.quantity : total
  }, 0)
  const remainingTotal =
    params.remainingItems.reduce((total, item) => total + Number.parseFloat(item.totalPrice), 0) + substitutedTotal

  if (substitutes.size > 0) {
    const unavailableLines = params.unavailableItems.map((item) => {
      const substitute = substitutes.get(item.id)
      return substitute
        ? PARTIAL_CONFIRMATION_MESSAGES.substituteLine(
            item.quantity,
            item.productName,
            substitute.productName,
            currencyFormatter.format(substitute.unitPrice)
          )
        : formatItemLine(item)
    })
    return [
      params.customerName
        ? PARTIAL_CONFIRMATION_MESSAGES.greetingWithName(params.customerName)
        : PARTIAL_CONFIRMATION_MESSAGES.greetingWithoutName,
      [PARTIAL_CONFIRMATION_MESSAGES.unavailableIntro, ...unavailableLines].join('\n'),
      ...(params.remainingItems.length > 0
        ? [[PARTIAL_CONFIRMATION_MESSAGES.remainingIntro, ...params.remainingItems.map(formatItemLine)].join('\n')]
        : []),
      PARTIAL_CONFIRMATION_MESSAGES.newTotalWithSubstitutes(currencyFormatter.format(remainingTotal)),
      PARTIAL_CONFIRMATION_MESSAGES.substituteOptions,
    ].join('\n\n')
  }

  const blocks = [
    params.customerName
      ? PARTIAL_CONFIRMATION_MESSAGES.greetingWithName(params.customerName)
      : PARTIAL_CONFIRMATION_MESSAGES.greetingWithoutName,
    [
      PARTIAL_CONFIRMATION_MESSAGES.unavailableIntro,
      ...params.unavailableItems.map(formatItemLine),
    ].join('\n'),
    [PARTIAL_CONFIRMATION_MESSAGES.remainingIntro, ...params.remainingItems.map(formatItemLine)].join(
      '\n'
    ),
    PARTIAL_CONFIRMATION_MESSAGES.newTotal(currencyFormatter.format(remainingTotal)),
    PARTIAL_CONFIRMATION_MESSAGES.confirmationRequest,
  ]

  return blocks.join('\n\n')
}

export class RequestPartialOrderConfirmationUseCase {
  constructor(
    private readonly db: Database,
    private readonly customerMessages: CustomerMessageProvider,
    private readonly createAuditLog: CreateAuditLogUseCase
  ) {}

  async execute(
    params: RequestPartialOrderConfirmationParams
  ): Promise<RequestPartialOrderConfirmationResult> {
    const order = await this.db.query.orders.findFirst({
      where: and(
        eq(schema.orders.id, params.orderId),
        eq(schema.orders.establishmentId, params.establishmentId)
      ),
      with: { items: true, customer: true },
    })

    if (!order) throw new NotFoundError('Order')

    if (ORDER_CLOSED_STATUSES.includes(order.status as (typeof ORDER_CLOSED_STATUSES)[number])) {
      throw new ValidationError(ORDER_ERROR_MESSAGES.closedOrder)
    }

    const whatsappNumber = order.customer?.whatsappNumber
    if (!whatsappNumber) throw new ValidationError(ORDER_ERROR_MESSAGES.noCustomerWhatsapp)

    const unavailableIds = new Set(params.unavailableItemIds)
    const unavailableItems = order.items.filter((item) => unavailableIds.has(item.id))
    const remainingItems = order.items.filter((item) => !unavailableIds.has(item.id))

    if (unavailableItems.length !== unavailableIds.size) {
      throw new ValidationError(ORDER_ERROR_MESSAGES.unknownItems)
    }

    const substitutions = await this.buildSubstitutions(params, order.items, unavailableIds)
    if (remainingItems.length === 0 && substitutions.length === 0) {
      throw new ValidationError(ORDER_ERROR_MESSAGES.allItemsUnavailable)
    }

    const message = buildPartialConfirmationMessage({
      customerName: order.customer?.name ?? null,
      unavailableItems,
      remainingItems,
      substitutes: new Map(substitutions.map((substitution) => [substitution.itemId, substitution.suggested])),
    })

    await this.customerMessages.sendText({
      establishmentId: params.establishmentId,
      whatsappNumber,
      body: message,
      agentUserId: params.userId,
    })

    // Uma pergunta pendente por pedido: a nova substitui a anterior.
    await this.db
      .update(schema.orderPartialConfirmations)
      .set({ status: PARTIAL_CONFIRMATION_STATUS.SUPERSEDED })
      .where(
        and(
          eq(schema.orderPartialConfirmations.orderId, order.id),
          eq(schema.orderPartialConfirmations.status, PARTIAL_CONFIRMATION_STATUS.PENDING)
        )
      )
    await this.db.insert(schema.orderPartialConfirmations).values({
      establishmentId: params.establishmentId,
      orderId: order.id,
      unavailableItemIds: [...unavailableIds],
      substitutions,
      status: PARTIAL_CONFIRMATION_STATUS.PENDING,
      requestedByUserId: params.userId,
    })

    // Depois do envio: auditar uma mensagem que não saiu seria pior do que não auditar.
    await this.createAuditLog.execute({
      establishmentId: params.establishmentId,
      userId: params.userId,
      action: PARTIAL_CONFIRMATION_AUDIT_ACTION,
      resourceType: ORDER_RESOURCE_TYPE,
      resourceId: order.id,
      metadata: {
        unavailableItemIds: [...unavailableIds],
        unavailableItemNames: unavailableItems.map((item) => item.productName),
        remainingItemCount: remainingItems.length,
        substitutions: substitutions.map((substitution) => ({
          itemId: substitution.itemId,
          productName: substitution.suggested.productName,
        })),
      },
    })

    return { message, whatsappNumber }
  }

  /**
   * Troca sugerida → produto ativo do cardápio, com preço do cadastro e as outras opções do mesmo tipo
   * (o cliente pode responder "escolher outro"). A sugestão da equipe vem sempre primeiro na lista.
   */
  private async buildSubstitutions(
    params: RequestPartialOrderConfirmationParams,
    items: ReadonlyArray<{ id: string; productId: string | null; productName: string; unitPrice: string }>,
    unavailableIds: ReadonlySet<string>
  ): Promise<PartialSubstitution[]> {
    const requested = params.substitutions ?? []
    if (requested.length === 0) return []

    const catalog = await OrderSubstituteCatalog.load(this.db, params.establishmentId)
    const unavailableProductIds = new Set(
      items.filter((item) => unavailableIds.has(item.id) && item.productId).map((item) => item.productId as string)
    )
    const substitutions: PartialSubstitution[] = []
    for (const { itemId, productId } of requested) {
      const item = items.find((candidate) => candidate.id === itemId)
      if (!item || !unavailableIds.has(itemId)) {
        throw new ValidationError(ORDER_ERROR_MESSAGES.substituteForAvailableItem)
      }
      const product = catalog.findOfferable(productId)
      if (!product || unavailableProductIds.has(productId)) throw new ValidationError(ORDER_ERROR_MESSAGES.unknownSubstitute)
      const suggested = { productId: product.productId, productName: product.productName, unitPrice: product.unitPrice }
      const others = catalog
        .substitutesFor(item, new Set([...unavailableProductIds, product.productId]))
        .map((candidate) => ({ productId: candidate.productId, productName: candidate.productName, unitPrice: candidate.unitPrice }))
      substitutions.push({ itemId, suggested, alternatives: [suggested, ...others].slice(0, MAX_SUBSTITUTES) })
    }
    return substitutions
  }
}
