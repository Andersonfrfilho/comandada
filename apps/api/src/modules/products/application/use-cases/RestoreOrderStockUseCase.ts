import { and, eq, like, or, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { add, compare, formatDecimal, fromInteger, multiply, parseDecimal, type Rational, type RecipeUnit } from '@adatechnology/recipe-contracts'
import { MOVEMENT_KIND } from '@adatechnology/stock-contracts'
import { createDrizzleStockPersistence, deductions, movements, type MovementRow, type StockDatabase } from '@adatechnology/stock-module'

import * as schema from '@/infra/database/schema'
import { LEGACY_ORDER_KEY_SUFFIX, ORDER_DEDUCTION_KEY_PREFIX, ORDER_RETURN_KEY_PREFIX } from '../../shared/orderStockMovements'

type Database = NodePgDatabase<typeof schema>

export type RestoreOrderStockInput = {
  readonly orderId: string
  readonly establishmentId: string
  readonly userId?: string | undefined
}

export type RestoreOrderStockResult = { readonly movementsCreated: number }

const NEGATE = fromInteger(-1)

function isReturnMovement(movement: MovementRow): boolean {
  if (movement.kind !== MOVEMENT_KIND.IN || movement.sourceKey === null) return false
  return movement.sourceKey.startsWith(ORDER_RETURN_KEY_PREFIX) || movement.sourceKey.endsWith(LEGACY_ORDER_KEY_SUFFIX)
}

/**
 * Baixas do pedido ainda valendo: as gravadas depois da última devolução. Pedido cancelado, reaberto e
 * produzido de novo baixa outra vez; cada devolução encerra a rodada anterior.
 */
export function findActiveOrderDeductions(orderMovements: readonly MovementRow[]): MovementRow[] {
  const lastReturnAt = orderMovements
    .filter(isReturnMovement)
    .reduce<number>((latest, movement) => Math.max(latest, movement.createdAt.getTime()), Number.NEGATIVE_INFINITY)
  return orderMovements.filter((movement) => movement.kind === MOVEMENT_KIND.OUT && movement.createdAt.getTime() > lastReturnAt)
}

function sumByKey<TKey extends string>(entries: readonly { readonly key: TKey; readonly amount: Rational }[]): Map<TKey, Rational> {
  const totals = new Map<TKey, Rational>()
  for (const entry of entries) totals.set(entry.key, add(totals.get(entry.key) ?? parseDecimal('0'), entry.amount))
  return totals
}

/**
 * O módulo de estoque não tem devolução: cancelar devolve ao mesmo lote o que a ficha baixou, grava a
 * entrada com a chave `order-return:<pedido>` e libera as chaves de baixa para uma nova produção baixar de novo.
 */
export class RestoreOrderStockUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: RestoreOrderStockInput): Promise<RestoreOrderStockResult> {
    return this.db.transaction(async (transaction) => {
      // Trava o pedido para dois cancelamentos ao mesmo tempo não devolverem em dobro.
      await transaction.execute(sql`SELECT id FROM orders WHERE id = ${input.orderId} FOR UPDATE`)

      const orderMovements = await transaction
        .select()
        .from(movements)
        .where(
          and(
            eq(movements.companyId, input.establishmentId),
            or(like(movements.sourceKey, `${ORDER_DEDUCTION_KEY_PREFIX}${input.orderId}:%`), eq(movements.sourceKey, `${ORDER_RETURN_KEY_PREFIX}${input.orderId}`))
          )
        )
      const active = findActiveOrderDeductions(orderMovements)
      const deductionKeys = and(eq(deductions.companyId, input.establishmentId), like(deductions.sourceKey, `${ORDER_DEDUCTION_KEY_PREFIX}${input.orderId}:%`))
      if (active.length === 0) {
        // Sem baixa valendo, as marcas que sobraram impediriam o pedido reaberto de baixar.
        await transaction.delete(deductions).where(deductionKeys)
        return { movementsCreated: 0 }
      }

      const persistence = createDrizzleStockPersistence(transaction as unknown as StockDatabase)
      const now = new Date()
      await persistence.stock.transaction(async (stockTransaction) => {
        const unitsByIngredient = new Map<string, RecipeUnit>(active.map((movement) => [movement.ingredientId, movement.unit as RecipeUnit]))
        const levels = await stockTransaction.lockLevels({
          companyId: input.establishmentId,
          ingredients: [...unitsByIngredient].map(([id, unit]) => ({ id, unit })),
          now,
        })

        const returnedByBatch = sumByKey(active.flatMap((movement) => (movement.batchId ? [{ key: movement.batchId, amount: multiply(parseDecimal(movement.delta), NEGATE) }] : [])))
        await Promise.all(
          [...returnedByBatch].map(async ([batchId, amount]) => {
            const batch = await stockTransaction.lockBatch({ companyId: input.establishmentId, id: batchId })
            if (!batch) return
            const restored = add(parseDecimal(batch.remainingQuantity), amount)
            const capacity = parseDecimal(batch.quantity)
            await stockTransaction.setBatchRemaining({ id: batch.id, remainingQuantity: formatDecimal(compare(restored, capacity) > 0 ? capacity : restored) })
          })
        )

        await stockTransaction.insertMovements(
          active.map((movement) => ({
            companyId: input.establishmentId,
            ingredientId: movement.ingredientId,
            batchId: movement.batchId,
            kind: MOVEMENT_KIND.IN,
            delta: formatDecimal(multiply(parseDecimal(movement.delta), NEGATE)),
            unit: movement.unit,
            reason: `Devolução por cancelamento do pedido ${input.orderId}`,
            actorId: input.userId ?? null,
            sourceKey: `${ORDER_RETURN_KEY_PREFIX}${input.orderId}`,
            createdAt: now,
          }))
        )

        const returnedByIngredient = sumByKey(active.map((movement) => ({ key: movement.ingredientId, amount: multiply(parseDecimal(movement.delta), NEGATE) })))
        await Promise.all(
          [...returnedByIngredient].map(([ingredientId, amount]) => {
            const level = levels.get(ingredientId)
            if (!level) return Promise.resolve()
            return stockTransaction.setLevelQuantity({
              companyId: input.establishmentId,
              ingredientId,
              quantity: formatDecimal(add(parseDecimal(level.quantity), amount)),
              now,
            })
          })
        )
      })

      await transaction.delete(deductions).where(deductionKeys)

      return { movementsCreated: active.length }
    })
  }
}
