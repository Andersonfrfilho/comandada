import { pgTable, uuid, integer, numeric, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { products } from './products'

/**
 * Co-ocorrência de produtos no mesmo pedido, materializada por job agendado.
 *
 * O par é **direcionado**: a linha (A → B) responde "quem levou A, com que
 * frequência levou B", que não é a mesma pergunta que (B → A) — um refrigerante
 * acompanha quase todo lanche, mas o lanche não acompanha quase todo refrigerante.
 * Guardar as duas direções também torna "sugestões para o produto X" um único
 * lookup indexado, sem `OR` sobre duas colunas.
 */
export const productAffinities = pgTable(
  'product_affinities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    suggestedProductId: uuid('suggested_product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Pedidos da janela em que os dois apareceram juntos. */
    coOccurrenceCount: integer('co_occurrence_count').notNull(),
    /** Pedidos da janela que contêm `productId`, com ou sem o sugerido. */
    productOrderCount: integer('product_order_count').notNull(),
    /** `coOccurrenceCount / productOrderCount` — gravado para ordenar sem recalcular. */
    confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
    /** Sem a data, não dá para saber se a sugestão é de ontem ou de um cardápio extinto. */
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('product_affinities_pair_unique').on(table.establishmentId, table.productId, table.suggestedProductId),
    index('product_affinities_lookup_idx').on(table.establishmentId, table.productId),
  ]
)

export type ProductAffinity = typeof productAffinities.$inferSelect
export type NewProductAffinity = typeof productAffinities.$inferInsert
