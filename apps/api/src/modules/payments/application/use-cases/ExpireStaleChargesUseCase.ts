import { and, eq, lt, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { CHARGE_KIND, CHARGE_STATUS } from '@adatechnology/payment-contracts'
import * as schema from '@/infra/database/schema'
import type { OrderPaymentTransitions } from '../services/OrderPaymentTransitions'
import type { PaymentAccountService } from '../services/PaymentAccountService'
import { ORDER_PAYMENT_STATUS } from '../../shared/payments.constant'

type Database = NodePgDatabase<typeof schema>

// Folga para o webhook de "pago no último minuto" chegar antes de cancelar.
const EXPIRATION_GRACE_MS = 2 * 60_000

// Link de cartão vencido não gera webhook (não existe pagamento): esta varredura cancela o pedido.
// Pix vencido o provedor avisa sozinho; aqui ele só é pego se o aviso se perdeu.
export class ExpireStaleChargesUseCase {
  constructor(
    private readonly db: Database,
    private readonly accounts: Pick<PaymentAccountService, 'findAccount' | 'gatewayFor'>,
    private readonly transitions: Pick<OrderPaymentTransitions, 'findOrder' | 'markFailed'>
  ) {}

  async execute(params: { now: Date }): Promise<number> {
    const stale = await this.db
      .select({ charge: schema.paymentCharges })
      .from(schema.paymentCharges)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.paymentCharges.orderId))
      .where(
        and(
          eq(schema.paymentCharges.status, CHARGE_STATUS.PENDING),
          lt(schema.paymentCharges.expiresAt, new Date(params.now.getTime() - EXPIRATION_GRACE_MS)),
          inArray(schema.orders.paymentStatus, [ORDER_PAYMENT_STATUS.AWAITING])
        )
      )
    let expired = 0
    for (const { charge } of stale) {
      // Pix que o provedor não deixa cancelar pode ter sido pago: o webhook decide, não a varredura.
      if (charge.kind === CHARGE_KIND.PIX && !(await this.cancelPix(charge))) continue
      const order = await this.transitions.findOrder({ establishmentId: charge.establishmentId, orderId: charge.orderId })
      if (order && (await this.transitions.markFailed(order, params.now))) expired += 1
    }
    return expired
  }

  // Garante que o Pix não pode mais ser pago depois que o pedido for cancelado.
  private async cancelPix(charge: schema.PaymentCharge): Promise<boolean> {
    try {
      const account = await this.accounts.findAccount({ establishmentId: charge.establishmentId, provider: charge.provider })
      if (!account) return false
      const gateway = this.accounts.gatewayFor(account)
      if (!gateway.cancelCharge) return false
      await gateway.cancelCharge({ id: charge.providerChargeId })
      return true
    } catch (error) {
      console.error('[Payments] pix cancel failed:', error instanceof Error ? error.message : error)
      return false
    }
  }
}
