import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { DeductOrderUseCase } from '@adatechnology/stock-module'
import type { OrderDeductionResult } from '@adatechnology/stock-contracts'

import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

const ORDER_CANCELLED_STATUS = 'cancelled'

export type DeductOrderStockInput = {
  readonly orderId: string
  readonly establishmentId: string
  readonly userId?: string | undefined
  /** Status que o chamador leu antes de decidir baixar; se o pedido foi cancelado nesse meio tempo, não baixa. */
  readonly observedStatus?: string | undefined
}

/**
 * Baixa do estoque pela ficha: uma chave por item do pedido (`order:<pedido>:<item>`), então repetir a
 * mudança de status não baixa de novo. Combo é expandido na fonte de fichas (`kitRecipeSource`).
 * Trava a linha do pedido (a mesma que `RestoreOrderStockUseCase` trava), então baixa e devolução do mesmo pedido não se cruzam.
 */
export class DeductOrderStockUseCase {
  constructor(
    private readonly db: Database,
    private readonly deductOrder: Pick<DeductOrderUseCase, 'execute'>
  ) {}

  async execute(input: DeductOrderStockInput): Promise<OrderDeductionResult | undefined> {
    return this.db.transaction(async (transaction) => {
      const locked = await transaction.execute<{ status: string }>(
        sql`SELECT status FROM orders WHERE id = ${input.orderId} AND establishment_id = ${input.establishmentId} FOR UPDATE`
      )
      const order = locked.rows[0]
      if (!order) return undefined
      const cancelledMeanwhile = order.status === ORDER_CANCELLED_STATUS && input.observedStatus !== undefined && input.observedStatus !== ORDER_CANCELLED_STATUS
      if (cancelledMeanwhile) return undefined

      const items = await transaction
        .select({ id: schema.orderItems.id, productId: schema.orderItems.productId, quantity: schema.orderItems.quantity })
        .from(schema.orderItems)
        .where(and(eq(schema.orderItems.orderId, input.orderId), isNotNull(schema.orderItems.productId)))

      const lines = items.flatMap((item) =>
        item.productId ? [{ lineKey: item.id, productId: item.productId, quantity: String(item.quantity) }] : []
      )
      if (lines.length === 0) return undefined

      return this.deductOrder.execute({
        companyId: input.establishmentId,
        ...(input.userId ? { actorId: input.userId } : {}),
        input: { orderId: input.orderId, lines },
      })
    })
  }
}
