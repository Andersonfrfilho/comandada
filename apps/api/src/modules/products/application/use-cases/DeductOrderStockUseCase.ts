import { and, eq, isNotNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { DeductOrderUseCase } from '@adatechnology/stock-module'
import type { OrderDeductionResult } from '@adatechnology/stock-contracts'

import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

export type DeductOrderStockInput = {
  readonly orderId: string
  readonly establishmentId: string
  readonly userId?: string | undefined
}

/**
 * Baixa do estoque pela ficha: uma chave por item do pedido (`order:<pedido>:<item>`), então repetir a
 * mudança de status não baixa de novo. Combo é expandido na fonte de fichas (`kitRecipeSource`).
 */
export class DeductOrderStockUseCase {
  constructor(
    private readonly db: Database,
    private readonly deductOrder: Pick<DeductOrderUseCase, 'execute'>
  ) {}

  async execute(input: DeductOrderStockInput): Promise<OrderDeductionResult | undefined> {
    const items = await this.db
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
  }
}
