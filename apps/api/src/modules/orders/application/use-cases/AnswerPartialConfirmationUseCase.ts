import { and, desc, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { PartialSubstitution } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, ValidationError } from '@/shared/errors/AppError'
import { canTransitionTo } from '../../domain/entities/Order'
import type { UpdateOrderStatusUseCase } from './UpdateOrderStatusUseCase'
import {
  ORDER_ERROR_MESSAGES,
  PARTIAL_CONFIRMATION_DECLINED_REASON,
  PARTIAL_CONFIRMATION_STATUS,
} from '../../shared/orders.constant'

type Database = NodePgDatabase<typeof schema>

export interface AnswerPartialConfirmationInput {
  readonly establishmentId: string
  readonly whatsappNumber: string
  readonly accept: boolean
  /**
   * Escolha do cliente para cada item em falta com troca: id do produto ou null (sem o item).
   * Ausente = aceitou as trocas sugeridas pela equipe.
   */
  readonly replacements?: Readonly<Record<string, string | null>> | undefined
}

export interface PartialReplacement {
  readonly from: string
  readonly to: string
  readonly quantity: number
}

export interface AnswerPartialConfirmationResult {
  readonly orderCode: string
  readonly status: 'accepted' | 'declined'
  readonly total: number
  /** Pago online antes da falta: a diferença precisa ser devolvida pela equipe. */
  readonly refundDue: number
  /** Itens trocados (para a mensagem de confirmação ao cliente). */
  readonly replaced: readonly PartialReplacement[]
}

/**
 * Resposta do cliente à confirmação parcial. SIM: os itens em falta saem do pedido, o total e o
 * pagamento (cada parte, na proporção) acompanham. NÃO: o pedido é cancelado.
 */
export class AnswerPartialConfirmationUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub: WebSocketHub,
    private readonly updateOrderStatus: Pick<UpdateOrderStatusUseCase, 'execute'>
  ) {}

  async execute(input: AnswerPartialConfirmationInput): Promise<AnswerPartialConfirmationResult> {
    const customer = await this.db.query.customers.findFirst({
      where: and(
        eq(schema.customers.establishmentId, input.establishmentId),
        eq(schema.customers.whatsappNumber, input.whatsappNumber)
      ),
      columns: { id: true },
    })
    if (!customer) throw new NotFoundError('PartialConfirmation')

    const [pending] = await this.db
      .select({ confirmation: schema.orderPartialConfirmations, order: schema.orders })
      .from(schema.orderPartialConfirmations)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderPartialConfirmations.orderId))
      .where(
        and(
          eq(schema.orderPartialConfirmations.establishmentId, input.establishmentId),
          eq(schema.orderPartialConfirmations.status, PARTIAL_CONFIRMATION_STATUS.PENDING),
          eq(schema.orders.customerId, customer.id)
        )
      )
      .orderBy(desc(schema.orderPartialConfirmations.createdAt))
      .limit(1)
    if (!pending) throw new NotFoundError('PartialConfirmation')

    const { confirmation, order } = pending
    const orderCode = order.code ?? order.id.slice(0, 8).toUpperCase()
    const now = new Date()

    const decline = async (): Promise<AnswerPartialConfirmationResult> => {
      await this.markAnswered(confirmation.id, PARTIAL_CONFIRMATION_STATUS.DECLINED, now)
      if (canTransitionTo(order.status, 'cancelled')) {
        await this.updateOrderStatus.execute({
          orderId: order.id,
          establishmentId: input.establishmentId,
          newStatus: 'cancelled',
          cancellationReason: PARTIAL_CONFIRMATION_DECLINED_REASON,
        })
      }
      return { orderCode, status: 'declined', total: Number(order.totalAmount), refundDue: 0, replaced: [] }
    }
    if (!input.accept) return decline()

    const unavailableIds = confirmation.unavailableItemIds
    const items = await this.db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id) })
    const remaining = items.filter((item) => !unavailableIds.includes(item.id))
    const choices = await this.resolveReplacements(
      input.establishmentId,
      confirmation.substitutions ?? [],
      input.replacements
    )
    const replacedItems = items
      .filter((item) => unavailableIds.includes(item.id) && choices.has(item.id))
      .map((item) => ({ item, product: choices.get(item.id)! }))
    // Sem nada para entregar (tudo faltou e o cliente não quis troca): é o mesmo que cancelar.
    if (remaining.length === 0 && replacedItems.length === 0) return decline()

    const itemsTotal =
      remaining.reduce((sum, item) => sum + Number(item.totalPrice), 0) +
      replacedItems.reduce((sum, { item, product }) => sum + product.unitPrice * item.quantity, 0)
    const previousTotal = Number(order.totalAmount)
    const newTotal = roundCents(itemsTotal + Number(order.deliveryFee ?? 0))

    for (const { item, product } of replacedItems) {
      await this.db
        .update(schema.orderItems)
        .set({
          productId: product.productId,
          productName: product.productName,
          unitPrice: product.unitPrice.toFixed(2),
          totalPrice: roundCents(product.unitPrice * item.quantity).toFixed(2),
          // A observação era do produto que faltou ("sem cebola" pode não fazer sentido no outro).
          notes: null,
        })
        .where(eq(schema.orderItems.id, item.id))
    }
    const removedIds = unavailableIds.filter((id) => !choices.has(id))
    if (removedIds.length > 0) {
      await this.db.delete(schema.orderItems).where(inArray(schema.orderItems.id, removedIds))
    }
    await this.db.update(schema.orders).set({ totalAmount: newTotal.toFixed(2) }).where(eq(schema.orders.id, order.id))
    await this.rescalePayments(order.id, newTotal)
    await this.markAnswered(confirmation.id, PARTIAL_CONFIRMATION_STATUS.ACCEPTED, now)

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.ORDER_UPDATED, {
      orderId: order.id,
      totalAmount: newTotal.toFixed(2),
      partialConfirmation: PARTIAL_CONFIRMATION_STATUS.ACCEPTED,
    })

    const refundDue = order.paymentStatus === 'paid' ? roundCents(previousTotal - newTotal) : 0
    const replaced = replacedItems.map(({ item, product }) => ({
      from: item.productName,
      to: product.productName,
      quantity: item.quantity,
    }))
    return { orderCode, status: 'accepted', total: newTotal, refundDue, replaced }
  }

  /**
   * Item em falta → produto que entra no lugar. Só vale produto oferecido para aquele item, e o preço
   * é relido do cadastro (nunca do que veio na mensagem).
   */
  private async resolveReplacements(
    establishmentId: string,
    substitutions: readonly PartialSubstitution[],
    replacements: Readonly<Record<string, string | null>> | undefined
  ): Promise<Map<string, { productId: string; productName: string; unitPrice: number }>> {
    const wanted = new Map<string, string>()
    for (const substitution of substitutions) {
      const productId = replacements ? replacements[substitution.itemId] ?? null : substitution.suggested.productId
      if (!productId) continue
      const offered = substitution.alternatives.some((alternative) => alternative.productId === productId)
        || substitution.suggested.productId === productId
      if (!offered) throw new ValidationError(ORDER_ERROR_MESSAGES.substituteNotOffered)
      wanted.set(substitution.itemId, productId)
    }
    if (wanted.size === 0) return new Map()

    const products = await this.db.query.products.findMany({
      where: and(
        eq(schema.products.establishmentId, establishmentId),
        inArray(schema.products.id, [...new Set(wanted.values())])
      ),
      columns: { id: true, name: true, price: true, active: true },
    })
    const chosen = new Map<string, { productId: string; productName: string; unitPrice: number }>()
    for (const [itemId, productId] of wanted) {
      const product = products.find((candidate) => candidate.id === productId)
      if (!product || !product.active) throw new ValidationError(ORDER_ERROR_MESSAGES.unknownSubstitute)
      chosen.set(itemId, { productId: product.id, productName: product.name, unitPrice: Number(product.price) })
    }
    return chosen
  }

  private async markAnswered(id: string, status: string, now: Date): Promise<void> {
    await this.db
      .update(schema.orderPartialConfirmations)
      .set({ status, answeredAt: now })
      .where(eq(schema.orderPartialConfirmations.id, id))
  }

  // Divisão e misto: cada parte diminui na mesma proporção; a última fecha os centavos.
  private async rescalePayments(orderId: string, newTotal: number): Promise<void> {
    const payments = await this.db.query.orderPayments.findMany({ where: eq(schema.orderPayments.orderId, orderId) })
    const paymentsTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
    if (payments.length === 0 || paymentsTotal <= 0) return
    const ratio = newTotal / paymentsTotal
    let assigned = 0
    for (const [index, payment] of payments.entries()) {
      const isLast = index === payments.length - 1
      const amount = isLast ? roundCents(newTotal - assigned) : roundCents(Number(payment.amount) * ratio)
      assigned = roundCents(assigned + amount)
      await this.db
        .update(schema.orderPayments)
        .set({ amount: Math.max(0, amount).toFixed(2) })
        .where(eq(schema.orderPayments.id, payment.id))
    }
  }
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}
