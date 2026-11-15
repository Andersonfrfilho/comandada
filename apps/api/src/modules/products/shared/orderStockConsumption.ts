import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Executor = Database | Transaction

/** Baixa da receita quando o pedido entra em produção. */
export const ORDER_CONSUMPTION_MOVEMENT = 'out'
/** Devolução da baixa quando o pedido é cancelado. */
export const ORDER_RETURN_MOVEMENT = 'return'

/**
 * Baixas do pedido que ainda estão valendo: as gravadas depois da última devolução.
 *
 * Um pedido pode ser cancelado (devolve), reaberto e produzido de novo (baixa outra vez). Cada
 * devolução encerra a rodada de baixas anterior; o que veio depois dela é o consumo atual.
 */
export async function findActiveOrderConsumption(
  executor: Executor,
  orderId: string
): Promise<schema.StockMovement[]> {
  const movements = await executor
    .select()
    .from(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.orderId, orderId),
      inArray(schema.stockMovements.movementType, [ORDER_CONSUMPTION_MOVEMENT, ORDER_RETURN_MOVEMENT])
    ))

  const lastReturnAt = movements
    .filter((movement) => movement.movementType === ORDER_RETURN_MOVEMENT)
    .reduce<number>((latest, movement) => Math.max(latest, movement.createdAt.getTime()), Number.NEGATIVE_INFINITY)

  return movements.filter(
    (movement) => movement.movementType === ORDER_CONSUMPTION_MOVEMENT && movement.createdAt.getTime() > lastReturnAt
  )
}
