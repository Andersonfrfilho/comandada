import { eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { ORDER_RETURN_MOVEMENT, findActiveOrderConsumption } from '../../shared/orderStockConsumption'

type Database = NodePgDatabase<typeof schema>

export interface RestoreStockForOrderInput {
  orderId: string
  establishmentId: string
  userId?: string | undefined
}

export interface RestoreStockForOrderResult {
  movementsCreated: number
}

/**
 * Cancelou: o que a receita tirou do estoque volta para o mesmo lote e para o saldo do ingrediente.
 * A parte que tinha ficado negativa (sem lote) volta só para o saldo. Rodar de novo não devolve outra vez.
 */
export class RestoreStockForOrderUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: RestoreStockForOrderInput): Promise<RestoreStockForOrderResult> {
    return this.db.transaction(async (transaction) => {
      // Trava o pedido para dois cancelamentos ao mesmo tempo não devolverem em dobro.
      await transaction.execute(sql`SELECT id FROM orders WHERE id = ${input.orderId} FOR UPDATE`)

      const consumption = await findActiveOrderConsumption(transaction, input.orderId)
      if (consumption.length === 0) return { movementsCreated: 0 }

      const returnedByIngredient = new Map<string, number>()

      for (const movement of consumption) {
        const quantity = Number(movement.quantity)

        if (movement.batchId) {
          await transaction
            .update(schema.stockBatches)
            .set({
              remainingQuantity: sql`${schema.stockBatches.remainingQuantity} + ${quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(schema.stockBatches.id, movement.batchId))
        }

        await transaction.insert(schema.stockMovements).values({
          establishmentId: input.establishmentId,
          ingredientId: movement.ingredientId,
          batchId: movement.batchId,
          orderId: input.orderId,
          movementType: ORDER_RETURN_MOVEMENT,
          quantity: movement.quantity,
          reason: `Devolução por cancelamento do pedido ${input.orderId}`,
          ...(input.userId ? { userId: input.userId } : {}),
        })

        returnedByIngredient.set(
          movement.ingredientId,
          (returnedByIngredient.get(movement.ingredientId) ?? 0) + quantity
        )
      }

      for (const [ingredientId, quantity] of returnedByIngredient) {
        await transaction
          .update(schema.ingredients)
          .set({
            stockQuantity: sql`${schema.ingredients.stockQuantity} + ${quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.ingredients.id, ingredientId))
      }

      return { movementsCreated: consumption.length }
    })
  }
}
