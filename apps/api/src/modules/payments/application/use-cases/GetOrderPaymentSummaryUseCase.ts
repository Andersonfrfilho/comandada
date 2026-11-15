import { and, asc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { supportsRefunds } from '@adatechnology/payment-contracts'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import type { OrderRefundLedger } from '../services/OrderRefundLedger'
import type { PaymentAccountService } from '../services/PaymentAccountService'

type Database = NodePgDatabase<typeof schema>

export type OrderPaymentSummary = {
  readonly paymentStatus: string
  readonly paid: string
  readonly refunded: string
  readonly refundable: string
  // `online`: estorno passa pelo provedor; `manual`: a equipe devolve no balcão; `none`: nada para devolver.
  readonly refundMode: 'online' | 'manual' | 'none'
  readonly charges: ReadonlyArray<{
    readonly id: string
    readonly provider: string
    readonly kind: string
    readonly status: string
    readonly amount: string
    readonly providerPaymentId: string | null
    readonly paidAt: Date | null
    readonly expiresAt: Date | null
    readonly createdAt: Date
  }>
  readonly refunds: ReadonlyArray<{
    readonly id: string
    readonly method: string
    readonly provider: string | null
    readonly providerRefundId: string | null
    readonly paymentMethod: string | null
    readonly amount: string
    readonly status: string
    readonly reason: string | null
    readonly failureMessage: string | null
    readonly createdAt: Date
    readonly createdBy: string | null
  }>
}

// Quadro de pagamento do detalhe do pedido: cobranças online, o que entrou, o que já voltou e como devolver.
export class GetOrderPaymentSummaryUseCase {
  constructor(
    private readonly db: Database,
    private readonly ledger: Pick<OrderRefundLedger, 'summary'>,
    private readonly accounts: Pick<PaymentAccountService, 'findAccount' | 'gatewayFor'>
  ) {}

  async execute(params: { establishmentId: string; orderId: string }): Promise<OrderPaymentSummary> {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(schema.orders.id, params.orderId), eq(schema.orders.establishmentId, params.establishmentId)),
    })
    if (!order) throw new NotFoundError('Order')

    const [summary, charges, refunds] = await Promise.all([
      this.ledger.summary(order),
      this.db
        .select()
        .from(schema.paymentCharges)
        .where(eq(schema.paymentCharges.orderId, order.id))
        .orderBy(asc(schema.paymentCharges.createdAt)),
      this.db
        .select({ refund: schema.paymentRefunds, createdBy: schema.users.name })
        .from(schema.paymentRefunds)
        .leftJoin(schema.users, eq(schema.users.id, schema.paymentRefunds.createdByUserId))
        .where(eq(schema.paymentRefunds.orderId, order.id))
        .orderBy(asc(schema.paymentRefunds.createdAt)),
    ])

    let refundMode: OrderPaymentSummary['refundMode'] = 'none'
    if (summary.refundable > 0) {
      refundMode = 'manual'
      if (summary.onlineCharge) {
        const account = await this.accounts.findAccount({
          establishmentId: order.establishmentId,
          provider: summary.onlineCharge.provider,
        })
        const gateway = account ? this.accounts.gatewayFor(account) : undefined
        // Sem estorno pela API (conta desligada, provedor sem suporte): devolve pelo painel do provedor.
        refundMode = gateway && supportsRefunds(gateway) && summary.onlineCharge.providerPaymentId ? 'online' : 'none'
      }
    }

    return {
      paymentStatus: order.paymentStatus,
      paid: summary.paid.toFixed(2),
      refunded: summary.refunded.toFixed(2),
      refundable: summary.refundable.toFixed(2),
      refundMode,
      charges: charges.map((charge) => ({
        id: charge.id,
        provider: charge.provider,
        kind: charge.kind,
        status: charge.status,
        amount: charge.amount,
        providerPaymentId: charge.providerPaymentId,
        paidAt: charge.paidAt,
        expiresAt: charge.expiresAt,
        createdAt: charge.createdAt,
      })),
      refunds: refunds.map(({ refund, createdBy }) => ({
        id: refund.id,
        method: refund.method,
        provider: refund.provider,
        providerRefundId: refund.providerRefundId,
        paymentMethod: refund.paymentMethod,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason,
        failureMessage: refund.failureMessage,
        createdAt: refund.createdAt,
        createdBy: createdBy ?? null,
      })),
    }
  }
}
