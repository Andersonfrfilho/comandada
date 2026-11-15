import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { supportsRefunds } from '@adatechnology/payment-contracts'
import * as schema from '@/infra/database/schema'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import type { PaymentAccountService } from '../services/PaymentAccountService'
import type { CompletedRefund, OrderRefundLedger, RefundableOrder } from '../services/OrderRefundLedger'
import { roundCents } from '../services/OrderRefundLedger'
import { CASH_METHOD_BY_CHARGE_KIND, PAYMENT_ERROR_MESSAGES, PAYMENT_REFUND_STATUS, REFUND_METHOD } from '../../shared/payments.constant'
import type { ChargeKind } from '@adatechnology/payment-contracts'

type Database = NodePgDatabase<typeof schema>

export interface RefundOrderPaymentParams {
  establishmentId: string
  orderId: string
  // Em reais. Sem valor, devolve tudo o que ainda não voltou.
  amount?: number | undefined
  reason?: string | undefined
  userId?: string | undefined
  notifyCustomer?: boolean | undefined
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Devolve dinheiro de um pedido. Pago por Pix/link de cartão → estorno no provedor, na conta do
 * restaurante. Pago no balcão (dinheiro, maquininha) → a equipe devolve na mão e aqui só fica o
 * registro e a saída do caixa. Total ou parcial; nunca mais do que entrou.
 */
export class RefundOrderPaymentUseCase {
  constructor(
    private readonly db: Database,
    private readonly accounts: Pick<PaymentAccountService, 'findAccount' | 'gatewayFor'>,
    private readonly ledger: Pick<OrderRefundLedger, 'summary' | 'reserve' | 'complete' | 'fail'>
  ) {}

  async execute(params: RefundOrderPaymentParams): Promise<CompletedRefund> {
    const order = (await this.db.query.orders.findFirst({
      where: and(eq(schema.orders.id, params.orderId), eq(schema.orders.establishmentId, params.establishmentId)),
      with: { customer: true },
    })) as RefundableOrder | undefined
    if (!order) throw new NotFoundError('Order')

    const summary = await this.ledger.summary(order)
    if (summary.refundable <= 0) throw new UnprocessableError(PAYMENT_ERROR_MESSAGES.nothingToRefund)
    const amount = roundCents(params.amount ?? summary.refundable)
    if (!(amount > 0) || amount > summary.refundable) {
      throw new UnprocessableError(PAYMENT_ERROR_MESSAGES.refundExceeds(brl(summary.refundable)))
    }

    const charge = summary.onlineCharge
    if (!charge) {
      const refund = await this.ledger.reserve(
        {
          order,
          amount,
          method: REFUND_METHOD.MANUAL,
          paymentMethod: summary.cashMethod,
          reason: params.reason,
          userId: params.userId,
        },
        summary.paid
      )
      if (!refund) throw new UnprocessableError(PAYMENT_ERROR_MESSAGES.refundExceeds(brl(summary.refundable)))
      return this.ledger.complete(order, refund, { status: PAYMENT_REFUND_STATUS.APPROVED }, summary.paid, {
        notifyCustomer: params.notifyCustomer,
      })
    }

    const account = await this.accounts.findAccount({ establishmentId: order.establishmentId, provider: charge.provider })
    const gateway = account ? this.accounts.gatewayFor(account) : undefined
    if (!gateway || !supportsRefunds(gateway) || !charge.providerPaymentId) {
      throw new UnprocessableError(PAYMENT_ERROR_MESSAGES.refundUnsupported)
    }

    const refund = await this.ledger.reserve(
      {
        order,
        amount,
        method: REFUND_METHOD.ONLINE,
        provider: charge.provider,
        chargeId: charge.id,
        paymentMethod: CASH_METHOD_BY_CHARGE_KIND[charge.kind as ChargeKind] ?? null,
        reason: params.reason,
        userId: params.userId,
      },
      summary.paid
    )
    if (!refund) throw new UnprocessableError(PAYMENT_ERROR_MESSAGES.refundExceeds(brl(summary.refundable)))

    const full = amount >= summary.refundable && summary.refunded === 0
    try {
      const result = await gateway.refundCharge({
        paymentId: charge.providerPaymentId,
        // Estorno do total vai sem valor: o provedor devolve o saldo inteiro, sem erro de centavo.
        amount: full ? undefined : { cents: Math.round(amount * 100), currency: 'BRL' },
        idempotencyKey: `refund-${refund.id}`,
      })
      if (result.status === 'failed') throw new Error('estorno recusado')
      return await this.ledger.complete(
        order,
        refund,
        {
          status: result.status === 'approved' ? PAYMENT_REFUND_STATUS.APPROVED : PAYMENT_REFUND_STATUS.PENDING,
          providerRefundId: result.id,
          chargeStatus: undefined,
        },
        summary.paid,
        { notifyCustomer: params.notifyCustomer }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.ledger.fail(order, refund, message)
      throw new UnprocessableError(PAYMENT_ERROR_MESSAGES.refundRejected(message))
    }
  }
}
