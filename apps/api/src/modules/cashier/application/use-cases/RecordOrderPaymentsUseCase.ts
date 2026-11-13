import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { cashMethodForPaymentName } from '@/shared/constants/paymentMethods.constant'
import type { AddCashMovementUseCase } from './AddCashMovementUseCase'

type Database = NodePgDatabase<typeof schema>

interface RecordOrderPaymentsInput {
  orderId: string
  establishmentId: string
}

/**
 * Pedido pago na entrega ou na retirada entra no caixa quando é concluído: uma entrada por parte do
 * pagamento (divisão, misto), com a forma de cada uma. Pagamento online já entrou quando o provedor
 * confirmou, e pedido que já tem lançamento no caixa (lançado à mão) não é lançado de novo.
 */
export class RecordOrderPaymentsUseCase {
  constructor(
    private readonly db: Database,
    private readonly addCashMovement: Pick<AddCashMovementUseCase, 'execute'>
  ) {}

  async execute(input: RecordOrderPaymentsInput): Promise<number> {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(schema.orders.id, input.orderId), eq(schema.orders.establishmentId, input.establishmentId)),
      columns: { paymentStatus: true },
    })
    if (!order || order.paymentStatus === 'paid') return 0

    const existing = await this.db.query.cashMovements.findFirst({
      where: and(eq(schema.cashMovements.orderId, input.orderId), eq(schema.cashMovements.type, 'payment')),
      columns: { id: true },
    })
    if (existing) return 0

    const payments = await this.db.query.orderPayments.findMany({
      where: eq(schema.orderPayments.orderId, input.orderId),
    })

    let recorded = 0
    for (const payment of payments) {
      const amount = Number(payment.amount)
      if (!(amount > 0)) continue
      await this.addCashMovement.execute({
        establishmentId: input.establishmentId,
        type: 'payment',
        paymentMethod: cashMethodForPaymentName(payment.paymentTypeName),
        amount,
        orderId: input.orderId,
        notes: payment.splitLabel ?? undefined,
      })
      recorded += 1
    }
    return recorded
  }
}
