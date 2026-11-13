import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { productAffinityQueue } from '@/infra/queue/productAffinityQueue'
import {
  PRODUCT_AFFINITY_JOB,
  PRODUCT_AFFINITY_SCAN_CRON,
  PRODUCT_AFFINITY_WINDOW_DAYS,
  PRODUCT_AFFINITY_MIN_CO_OCCURRENCE,
  PRODUCT_AFFINITY_MIN_CONFIDENCE,
} from '@/infra/queue/QueueNames.constant'

type Database = NodePgDatabase<typeof schema>

/**
 * Recalcula a co-ocorrência de produtos a partir do histórico de pedidos.
 *
 * Roda em job agendado e nunca em requisição: é uma varredura de todo o histórico
 * da janela, e o custo não pode cair no tempo de resposta de quem está cadastrando
 * produto.
 *
 * O recálculo é total, não incremental. Contagem incremental derivaria da verdade
 * a cada pedido cancelado ou item removido, e a janela móvel exige reprocessar o
 * passado de qualquer forma.
 */
export async function calculateProductAffinities(database: Database): Promise<{ pairs: number }> {
  const rows = await database.transaction(async (transaction) => {
    await transaction.delete(schema.productAffinities)

    // Um mesmo produto pode aparecer em duas linhas do pedido (sabores, observações
    // diferentes). Sem o DISTINCT, isso contaria como co-ocorrência do item consigo
    // mesmo e inflaria o par.
    return transaction.execute(sql`
      WITH order_products AS (
        SELECT DISTINCT ${schema.orderItems.orderId} AS order_id,
                        ${schema.orders.establishmentId} AS establishment_id,
                        ${schema.orderItems.productId} AS product_id
        FROM ${schema.orderItems}
        JOIN ${schema.orders} ON ${schema.orders.id} = ${schema.orderItems.orderId}
        WHERE ${schema.orderItems.productId} IS NOT NULL
          AND ${schema.orders.cancelledAt} IS NULL
          AND ${schema.orders.createdAt} >= now() - ${`${PRODUCT_AFFINITY_WINDOW_DAYS} days`}::interval
      ),
      product_totals AS (
        SELECT establishment_id, product_id, COUNT(*)::int AS product_order_count
        FROM order_products
        GROUP BY establishment_id, product_id
      ),
      pairs AS (
        SELECT base.establishment_id,
               base.product_id,
               other.product_id AS suggested_product_id,
               COUNT(*)::int AS co_occurrence_count
        FROM order_products base
        JOIN order_products other
          ON other.order_id = base.order_id
         AND other.product_id <> base.product_id
        GROUP BY base.establishment_id, base.product_id, other.product_id
      )
      INSERT INTO product_affinities
        (establishment_id, product_id, suggested_product_id,
         co_occurrence_count, product_order_count, confidence)
      SELECT pairs.establishment_id,
             pairs.product_id,
             pairs.suggested_product_id,
             pairs.co_occurrence_count,
             product_totals.product_order_count,
             ROUND(pairs.co_occurrence_count::numeric / product_totals.product_order_count, 4)
      FROM pairs
      JOIN product_totals
        ON product_totals.establishment_id = pairs.establishment_id
       AND product_totals.product_id = pairs.product_id
      WHERE pairs.co_occurrence_count >= ${PRODUCT_AFFINITY_MIN_CO_OCCURRENCE}
        AND pairs.co_occurrence_count::numeric / product_totals.product_order_count
            >= ${PRODUCT_AFFINITY_MIN_CONFIDENCE}
    `)
  })

  const pairs = rows.rowCount ?? 0
  console.log(`[ProductAffinityCalculator] ${pairs} par(es) calculado(s) (janela: ${PRODUCT_AFFINITY_WINDOW_DAYS}d)`)
  return { pairs }
}

export async function scheduleProductAffinityCalculation(): Promise<void> {
  await productAffinityQueue.add(
    PRODUCT_AFFINITY_JOB.CALCULATE,
    {},
    {
      repeat: { pattern: PRODUCT_AFFINITY_SCAN_CRON },
      jobId: 'product-affinity-calculate',
    }
  )
}
