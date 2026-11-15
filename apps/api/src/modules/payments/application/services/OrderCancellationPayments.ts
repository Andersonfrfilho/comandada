import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { CHARGE_KIND, CHARGE_STATUS } from '@adatechnology/payment-contracts'
import * as schema from '@/infra/database/schema'
import type { PaymentAccountService } from './PaymentAccountService'
import { ORDER_PAYMENT_STATUS } from '../../shared/payments.constant'

type Database = NodePgDatabase<typeof schema>

/**
 * Pedido cancelado com cobrança em aberto: o Pix é cancelado no provedor para o cliente não conseguir
 * pagar um pedido que não vai sair. Link de cartão não tem como cancelar pela API; se alguém pagar
 * mesmo assim, o webhook vê o pedido cancelado e devolve sozinho.
 */
export class OrderCancellationPayments {
  constructor(
    private readonly db: Database,
    private readonly accounts: Pick<PaymentAccountService, 'findAccount' | 'gatewayFor'>
  ) {}

  async releasePending(order: Pick<schema.Order, 'id' | 'establishmentId' | 'paymentStatus'>): Promise<number> {
    if (order.paymentStatus !== ORDER_PAYMENT_STATUS.AWAITING) return 0
    const pending = await this.db.query.paymentCharges.findMany({
      where: and(eq(schema.paymentCharges.orderId, order.id), eq(schema.paymentCharges.status, CHARGE_STATUS.PENDING)),
    })
    let cancelled = 0
    for (const charge of pending) {
      if (charge.kind !== CHARGE_KIND.PIX) continue
      try {
        const account = await this.accounts.findAccount({ establishmentId: charge.establishmentId, provider: charge.provider })
        const gateway = account ? this.accounts.gatewayFor(account) : undefined
        if (!gateway?.cancelCharge) continue
        await gateway.cancelCharge({ id: charge.providerChargeId })
        cancelled += 1
      } catch (error) {
        // Não conseguiu cancelar: se o Pix for pago, o webhook devolve.
        console.error('[Payments] pix cancel on order cancel failed:', error instanceof Error ? error.message : error)
      }
    }
    await this.db
      .update(schema.paymentCharges)
      .set({ status: CHARGE_STATUS.FAILED, updatedAt: new Date() })
      .where(and(eq(schema.paymentCharges.orderId, order.id), eq(schema.paymentCharges.status, CHARGE_STATUS.PENDING)))
    await this.db
      .update(schema.orders)
      .set({ paymentStatus: ORDER_PAYMENT_STATUS.FAILED })
      .where(eq(schema.orders.id, order.id))
    return cancelled
  }
}
