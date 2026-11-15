import { orderDisplayCode } from '@/modules/orders/shared/orderNumber'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { CHARGE_STATUS } from '@adatechnology/payment-contracts'
import * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import type { AddCashMovementUseCase } from '@/modules/cashier/application/use-cases/AddCashMovementUseCase'
import type { BotMessageProvider } from '@/shared/providers/BotMessageProvider'
import type { PaymentMethod } from '@/shared/types'
import {
  ORDER_PAYMENT_STATUS,
  PAYMENT_CUSTOMER_MESSAGES,
  PAYMENT_REFUND_STATUS,
  PAYMENT_TEMPLATE_TEXTS,
  REFUND_CENTS_TOLERANCE,
  REFUNDABLE_ONLINE_STATUSES,
} from '../../shared/payments.constant'
import type { PaymentRefundStatus, RefundMethod } from '../../shared/payments.constant'

type Database = NodePgDatabase<typeof schema>

export type RefundableOrder = schema.Order & { customer: schema.Customer | null }

// O que entrou no pedido e de onde: a cobrança online aprovada, ou os lançamentos de pagamento no caixa.
export type OrderPaidSummary = {
  readonly paid: number
  readonly refunded: number
  readonly refundable: number
  readonly onlineCharge: schema.PaymentCharge | null
  readonly cashMethod: PaymentMethod | null
}

export type RefundReservation = {
  readonly order: RefundableOrder
  readonly amount: number
  readonly method: RefundMethod
  readonly provider?: string | null | undefined
  readonly chargeId?: string | null | undefined
  readonly paymentMethod: PaymentMethod | null
  readonly reason?: string | null | undefined
  readonly userId?: string | null | undefined
}

export type CompletedRefund = {
  readonly refund: schema.PaymentRefund
  readonly paymentStatus: string
  readonly refundedAmount: number
  readonly cashRecorded: boolean
}

export interface OrderRefundLedgerDependencies {
  readonly db: Database
  readonly wsHub: Pick<WebSocketHub, 'publishBroadcast'>
  readonly botMessages: BotMessageProvider
  readonly addCashMovement: Pick<AddCashMovementUseCase, 'execute'>
}

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function orderCode(order: schema.Order): string {
  return orderDisplayCode(order)
}

/**
 * Livro das devoluções de um pedido. Toda devolução, online ou no balcão, passa por aqui em dois passos:
 * `reserve` soma o valor em `orders.refunded_amount` antes de qualquer chamada ao provedor (só se ainda
 * couber no que foi pago), e `complete`/`fail` fecham. Assim dois cliques, ou o estorno feito aqui e o
 * webhook dele, nunca devolvem a mesma coisa duas vezes.
 */
export class OrderRefundLedger {
  constructor(private readonly deps: OrderRefundLedgerDependencies) {}

  async summary(order: schema.Order): Promise<OrderPaidSummary> {
    const refunded = Number(order.refundedAmount ?? 0)
    if ((REFUNDABLE_ONLINE_STATUSES as readonly string[]).includes(order.paymentStatus) || order.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED) {
      const [charge] = await this.deps.db
        .select()
        .from(schema.paymentCharges)
        .where(
          and(
            eq(schema.paymentCharges.orderId, order.id),
            inArray(schema.paymentCharges.status, [CHARGE_STATUS.APPROVED, CHARGE_STATUS.REFUNDED, CHARGE_STATUS.CHARGEBACK])
          )
        )
        .orderBy(desc(schema.paymentCharges.paidAt))
        .limit(1)
      if (charge) {
        const paid = Number(charge.amount)
        return { paid, refunded, refundable: roundCents(Math.max(paid - refunded, 0)), onlineCharge: charge, cashMethod: null }
      }
    }
    const payments = await this.deps.db
      .select({ amount: schema.cashMovements.amount, paymentMethod: schema.cashMovements.paymentMethod })
      .from(schema.cashMovements)
      .where(and(eq(schema.cashMovements.orderId, order.id), eq(schema.cashMovements.type, 'payment')))
    const paid = roundCents(payments.reduce((sum, payment) => sum + Number(payment.amount), 0))
    // Devolução no balcão sai pela forma que mais entrou (troco em dinheiro, estorno na maquininha).
    const biggest = [...payments].sort((left, right) => Number(right.amount) - Number(left.amount))[0]
    return {
      paid,
      refunded,
      refundable: roundCents(Math.max(paid - refunded, 0)),
      onlineCharge: null,
      cashMethod: biggest?.paymentMethod ?? null,
    }
  }

  // Soma o valor no pedido só se ainda couber no que foi pago. `undefined`: não coube (outro estorno chegou antes).
  async reserve(input: RefundReservation, paid: number): Promise<schema.PaymentRefund | undefined> {
    const amount = roundCents(input.amount).toFixed(2)
    const [reserved] = await this.deps.db
      .update(schema.orders)
      .set({ refundedAmount: sql`${schema.orders.refundedAmount} + ${amount}::numeric` })
      .where(
        and(
          eq(schema.orders.id, input.order.id),
          sql`${schema.orders.refundedAmount} + ${amount}::numeric <= ${roundCents(paid).toFixed(2)}::numeric`
        )
      )
      .returning({ id: schema.orders.id })
    if (!reserved) return undefined
    const [refund] = await this.deps.db
      .insert(schema.paymentRefunds)
      .values({
        establishmentId: input.order.establishmentId,
        orderId: input.order.id,
        chargeId: input.chargeId ?? null,
        method: input.method,
        provider: input.provider ?? null,
        paymentMethod: input.paymentMethod,
        amount,
        status: PAYMENT_REFUND_STATUS.PROCESSING,
        reason: input.reason ?? null,
        createdByUserId: input.userId ?? null,
      })
      .returning()
    return refund!
  }

  async complete(
    order: RefundableOrder,
    refund: schema.PaymentRefund,
    result: { status: PaymentRefundStatus; providerRefundId?: string | null | undefined; chargeStatus?: string | undefined },
    paid: number,
    options: { notifyCustomer?: boolean | undefined } = {}
  ): Promise<CompletedRefund> {
    const [updated] = await this.deps.db
      .update(schema.paymentRefunds)
      .set({ status: result.status, providerRefundId: result.providerRefundId ?? null, updatedAt: new Date() })
      .where(eq(schema.paymentRefunds.id, refund.id))
      .returning()

    const [current] = await this.deps.db
      .select({ refundedAmount: schema.orders.refundedAmount })
      .from(schema.orders)
      .where(eq(schema.orders.id, order.id))
    const refundedAmount = Number(current?.refundedAmount ?? refund.amount)
    const fullyRefunded = refundedAmount >= paid - REFUND_CENTS_TOLERANCE
    const paymentStatus = fullyRefunded ? ORDER_PAYMENT_STATUS.REFUNDED : ORDER_PAYMENT_STATUS.PARTIALLY_REFUNDED
    await this.deps.db.update(schema.orders).set({ paymentStatus }).where(eq(schema.orders.id, order.id))
    if (refund.chargeId && (fullyRefunded || result.chargeStatus)) {
      await this.deps.db
        .update(schema.paymentCharges)
        .set({ status: result.chargeStatus ?? CHARGE_STATUS.REFUNDED, updatedAt: new Date() })
        .where(eq(schema.paymentCharges.id, refund.chargeId))
    }

    const amount = Number(refund.amount)
    const cashRecorded = await this.deps.addCashMovement
      .execute({
        establishmentId: order.establishmentId,
        type: 'refund',
        paymentMethod: (refund.paymentMethod as PaymentMethod | null) ?? undefined,
        amount,
        orderId: order.id,
        notes: [refund.provider, refund.providerRefundId, refund.reason].filter(Boolean).join(' · ') || undefined,
      })
      .then(() => true)
      .catch((error: unknown) => {
        // Sem caixa aberto a devolução continua valendo: fica no pedido e no histórico de estornos.
        console.error('[Payments] refund cash movement skipped:', error instanceof Error ? error.message : error)
        return false
      })

    await this.deps.wsHub.publishBroadcast(order.establishmentId, WS_EVENTS.ORDER_UPDATED, {
      orderId: order.id,
      paymentStatus,
      refundedAmount: refundedAmount.toFixed(2),
    })
    if (options.notifyCustomer !== false) {
      const code = orderCode(order)
      if (fullyRefunded) await this.notify(order, PAYMENT_CUSTOMER_MESSAGES.refunded(code), PAYMENT_TEMPLATE_TEXTS.refunded)
      else
        await this.notify(
          order,
          PAYMENT_CUSTOMER_MESSAGES.partiallyRefunded(code, brl(amount)),
          PAYMENT_TEMPLATE_TEXTS.partiallyRefunded
        )
    }
    return { refund: updated ?? refund, paymentStatus, refundedAmount, cashRecorded }
  }

  // O provedor recusou: devolve a reserva para o pedido poder tentar de novo.
  async fail(order: schema.Order, refund: schema.PaymentRefund, message: string): Promise<void> {
    await this.deps.db
      .update(schema.paymentRefunds)
      .set({ status: PAYMENT_REFUND_STATUS.FAILED, failureMessage: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(schema.paymentRefunds.id, refund.id))
    await this.deps.db
      .update(schema.orders)
      .set({ refundedAmount: sql`greatest(${schema.orders.refundedAmount} - ${refund.amount}::numeric, 0)` })
      .where(eq(schema.orders.id, order.id))
  }

  private async notify(order: RefundableOrder, body: string, templateText: string): Promise<void> {
    const whatsappNumber = order.customer?.whatsappNumber
    if (order.channel !== 'whatsapp' || !whatsappNumber) return
    await this.deps.botMessages
      .sendText({
        establishmentId: order.establishmentId,
        whatsappNumber,
        body,
        outsideWindow: { parameters: [orderCode(order), templateText] },
      })
      .catch((error: unknown) =>
        console.error('[Payments] customer message failed:', error instanceof Error ? error.message : error)
      )
  }
}
