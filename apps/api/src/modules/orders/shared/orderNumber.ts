import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

/**
 * Paridade do número neste nó quando loja e nuvem criam pedidos ao mesmo tempo: a loja fica com os
 * ímpares e a nuvem com os pares (a mesma regra dos ids seriais da sincronização), então os dois
 * nunca dão o mesmo `#N`. Sem sincronização, a sequência é 1, 2, 3…
 */
export function orderNumberParity(syncRole: string | undefined = process.env['SYNC_ROLE']): 0 | 1 | null {
  if (syncRole === 'loja') return 1
  if (syncRole === 'nuvem') return 0
  return null
}

/** Menor número acima de `last` com a paridade do nó. */
export function nextNumberAfter(last: number, parity: 0 | 1 | null): number {
  const candidate = last + 1
  if (parity === null || candidate % 2 === parity) return candidate
  return candidate + 1
}

/**
 * Próximo número de pedido do restaurante; a linha do contador serializa pedidos simultâneos.
 * Parte do maior número já gravado (inclusive os que chegaram do outro nó pela sincronização), então
 * a sequência continua de onde o restaurante está, seja qual for o servidor que recebeu o pedido.
 */
export async function nextOrderNumber(db: Database, establishmentId: string): Promise<number> {
  const parity = orderNumberParity()
  const maxStored = sql`coalesce((SELECT max(number) FROM orders WHERE establishment_id = ${establishmentId}), 0)`
  // No ON CONFLICT, `order_counters.last_number` é a linha já travada: dois pedidos ao mesmo tempo
  // esperam um pelo outro e saem com números diferentes.
  const nextAfter = (last: ReturnType<typeof sql>) => sql`
    CASE WHEN ${parity}::int IS NULL OR ((${last}) + 1) % 2 = ${parity}::int THEN (${last}) + 1 ELSE (${last}) + 2 END`
  const result = await db.execute<{ last_number: number }>(sql`
    INSERT INTO order_counters (establishment_id, last_number)
    VALUES (${establishmentId}, ${nextAfter(maxStored)})
    ON CONFLICT (establishment_id) DO UPDATE
      SET last_number = ${nextAfter(sql`greatest(order_counters.last_number, ${maxStored})`)}
    RETURNING last_number
  `)
  const row = result.rows[0]
  if (!row) throw new Error('order counter not updated')
  return Number(row.last_number)
}

interface OrderReference {
  id: string
  number?: number | null
  code?: string | null
}

/**
 * O que cliente e equipe leem como identificação do pedido: "#123". Sem número (pedido vindo da
 * sincronização da loja), o código do bot ou o começo do id.
 */
export function orderDisplayCode(order: OrderReference): string {
  if (order.number) return `#${order.number}`
  return order.code ?? order.id.slice(0, 8).toUpperCase()
}

/** Para o bot, que já põe o "#" na frente ao mostrar. */
export function orderBotCode(order: OrderReference): string {
  return orderDisplayCode(order).replace(/^#/, '')
}

/** Backfill de pedidos sem número (seed e pedidos antigos); mesmo SQL da migration 0049. */
export async function numberOrdersWithoutNumber(db: Database): Promise<void> {
  await db.execute(sql`
    UPDATE orders SET number = numbered.position
    FROM (
      SELECT id, (SELECT coalesce(max(number), 0) FROM orders o2 WHERE o2.establishment_id = o.establishment_id)
        + row_number() OVER (PARTITION BY establishment_id ORDER BY created_at, id) AS position
      FROM orders o WHERE number IS NULL
    ) AS numbered
    WHERE orders.id = numbered.id
  `)
  await db.execute(sql`
    INSERT INTO order_counters (establishment_id, last_number)
    SELECT establishment_id, max(number) FROM orders WHERE number IS NOT NULL GROUP BY establishment_id
    ON CONFLICT (establishment_id) DO UPDATE SET last_number = GREATEST(order_counters.last_number, EXCLUDED.last_number)
  `)
}
