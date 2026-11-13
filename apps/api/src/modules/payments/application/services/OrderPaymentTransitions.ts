import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { CHARGE_KIND, CHARGE_STATUS } from '@adatechnology/payment-contracts'
import type { ChargeKind, ChargeStatus } from '@adatechnology/payment-contracts'
import * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import type { AddCashMovementUseCase } from '@/modules/cashier/application/use-cases/AddCashMovementUseCase'
import type { CancelScheduleBookingUseCase } from '@/modules/agenda/application/use-cases/CancelScheduleBookingUseCase'
import { SCHEDULING_ACTOR_BOT } from '@/modules/agenda/shared/agenda.constant'
import type { BotMessageProvider } from '@/shared/providers/BotMessageProvider'
import {
  CASH_METHOD_BY_CHARGE_KIND,
  ORDER_PAYMENT_STATUS,
  PAYMENT_CUSTOMER_MESSAGES,
  PAYMENT_TEMPLATE_TEXTS,
  PAYMENT_EXPIRED_CANCELLATION_REASON,
} from '../../shared/payments.constant'

type Database = NodePgDatabase<typeof schema>

type OrderWithCustomer = schema.Order & { customer: schema.Customer | null }

export type PaidDetails = {
  readonly provider: string
  readonly providerPaymentId: string | null
  readonly amount: number | null
  readonly kind: ChargeKind | null
}

export interface OrderPaymentTransitionsDependencies {
  readonly db: Database
  readonly wsHub: Pick<WebSocketHub, 'publishBroadcast'>
  readonly botMessages: BotMessageProvider
  readonly addCashMovement: Pick<AddCashMovementUseCase, 'execute'>
  readonly cancelBooking?: Pick<CancelScheduleBookingUseCase, 'execute'> | undefined
}

function orderCode(order: schema.Order): string {
  return order.code ?? order.id.slice(0, 8).toUpperCase()
}

// O que muda no pedido quando o pagamento online cai, expira ou volta. Cada passo é idempotente:
// o mesmo evento repetido (ou webhook + varredura) não paga duas vezes nem cancela duas vezes.
export class OrderPaymentTransitions {
  constructor(private readonly deps: OrderPaymentTransitionsDependencies) {}

  async findOrder(params: { establishmentId: string; orderId: string }): Promise<OrderWithCustomer | undefined> {
    const order = await this.deps.db.query.orders.findFirst({
      where: and(eq(schema.orders.id, params.orderId), eq(schema.orders.establishmentId, params.establishmentId)),
      with: { customer: true },
    })
    return order as OrderWithCustomer | undefined
  }

  async markPaid(order: OrderWithCustomer, details: PaidDetails, now: Date): Promise<boolean> {
    if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) return false
    const charges = await this.deps.db.query.paymentCharges.findMany({
      where: eq(schema.paymentCharges.orderId, order.id),
    })
    await this.updateCharges(order.id, CHARGE_STATUS.APPROVED, { paidAt: now, providerPaymentId: details.providerPaymentId })
    await this.deps.db
      .update(schema.orders)
      .set({ paymentStatus: ORDER_PAYMENT_STATUS.PAID })
      .where(eq(schema.orders.id, order.id))

    const kind = details.kind ?? (charges[0]?.kind as ChargeKind | undefined) ?? CHARGE_KIND.PIX
    const amount = details.amount ?? Number(order.totalAmount)
    await this.deps.addCashMovement
      .execute({
        establishmentId: order.establishmentId,
        type: 'payment',
        paymentMethod: CASH_METHOD_BY_CHARGE_KIND[kind],
        amount,
        orderId: order.id,
        notes: `${details.provider} ${details.providerPaymentId ?? ''}`.trim(),
      })
      .catch((error: unknown) => {
        // Sem caixa aberto o pagamento continua valendo: fica no pedido e na cobrança.
        console.error('[Payments] cash movement skipped:', error instanceof Error ? error.message : error)
      })

    await this.deps.wsHub.publishBroadcast(order.establishmentId, WS_EVENTS.ORDER_UPDATED, {
      orderId: order.id,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    })
    if (order.status === 'cancelled') {
      // Pagou depois de cancelado (corrida rara com a expiração): a equipe decide, o bot não promete cozinha.
      console.error('[Payments] paid after cancellation, needs manual refund:', order.id)
      return true
    }
    await this.deps.wsHub.publishBroadcast(order.establishmentId, WS_EVENTS.KITCHEN_ORDER_QUEUED, {
      orderId: order.id,
      type: order.type,
      status: order.status,
    })
    await this.notify(order, PAYMENT_CUSTOMER_MESSAGES.paid(orderCode(order)), PAYMENT_TEMPLATE_TEXTS.paid)
    return true
  }

  async markFailed(order: OrderWithCustomer, now: Date): Promise<boolean> {
    if (order.paymentStatus !== ORDER_PAYMENT_STATUS.AWAITING) return false
    await this.updateCharges(order.id, CHARGE_STATUS.FAILED)
    const cancel = order.status === 'received'
    await this.deps.db
      .update(schema.orders)
      .set({
        paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
        ...(cancel ? { status: 'cancelled' as const, cancelledAt: now, cancellationReason: PAYMENT_EXPIRED_CANCELLATION_REASON } : {}),
      })
      .where(eq(schema.orders.id, order.id))
    if (cancel && order.scheduleBookingId && this.deps.cancelBooking) {
      await this.deps.cancelBooking
        .execute({
          establishmentId: order.establishmentId,
          bookingId: order.scheduleBookingId,
          cancelledBy: SCHEDULING_ACTOR_BOT,
          reason: PAYMENT_EXPIRED_CANCELLATION_REASON,
        })
        .catch((error: unknown) =>
          console.error('[Payments] schedule release failed:', error instanceof Error ? error.message : error)
        )
    }
    await this.deps.wsHub.publishBroadcast(order.establishmentId, cancel ? WS_EVENTS.ORDER_CANCELLED : WS_EVENTS.ORDER_UPDATED, {
      orderId: order.id,
      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
      ...(cancel ? { status: 'cancelled', reason: PAYMENT_EXPIRED_CANCELLATION_REASON } : {}),
    })
    if (cancel) await this.notify(order, PAYMENT_CUSTOMER_MESSAGES.expired(orderCode(order)), PAYMENT_TEMPLATE_TEXTS.expired)
    return true
  }

  async markRefunded(order: OrderWithCustomer, status: ChargeStatus): Promise<boolean> {
    if (order.paymentStatus !== ORDER_PAYMENT_STATUS.PAID) return false
    await this.updateCharges(order.id, status)
    await this.deps.db
      .update(schema.orders)
      .set({ paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED })
      .where(eq(schema.orders.id, order.id))
    await this.deps.wsHub.publishBroadcast(order.establishmentId, WS_EVENTS.ORDER_UPDATED, {
      orderId: order.id,
      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
    })
    await this.notify(order, PAYMENT_CUSTOMER_MESSAGES.refunded(orderCode(order)), PAYMENT_TEMPLATE_TEXTS.refunded)
    return true
  }

  private async updateCharges(
    orderId: string,
    status: ChargeStatus,
    extra: { paidAt?: Date; providerPaymentId?: string | null } = {}
  ): Promise<void> {
    await this.deps.db
      .update(schema.paymentCharges)
      .set({
        status,
        updatedAt: new Date(),
        ...(extra.paidAt ? { paidAt: extra.paidAt } : {}),
        ...(extra.providerPaymentId ? { providerPaymentId: extra.providerPaymentId } : {}),
      })
      .where(eq(schema.paymentCharges.orderId, orderId))
  }

  private async notify(order: OrderWithCustomer, body: string, templateText: string): Promise<void> {
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
