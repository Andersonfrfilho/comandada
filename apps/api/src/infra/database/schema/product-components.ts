import { pgTable, uuid, integer, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { products } from './products'

/**
 * Composição de um kit/combo: quais produtos ele agrega e em que quantidade.
 *
 * O kit tem preço próprio (a coluna `price` do próprio produto), que é o motivo de
 * existir — combo custa menos que a soma. O que ele **não** tem é receita própria:
 * a baixa de estoque expande o kit nos componentes e aplica a receita de cada um,
 * reaproveitando a T1.2 sem duplicar regra de consumo.
 *
 * Componente de kit não pode ser kit. A restrição é validada no cadastro, não aqui:
 * sem ela a expansão seria recursiva e um ciclo (A contém B, B contém A) travaria a
 * baixa de um pedido — que é justamente o caminho onde há dinheiro em jogo.
 */
export const productComponents = pgTable(
  'product_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kitProductId: uuid('kit_product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    componentProductId: uuid('component_product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('product_components_pair_unique').on(table.kitProductId, table.componentProductId),
    index('product_components_kit_idx').on(table.kitProductId),
  ]
)

export type ProductComponent = typeof productComponents.$inferSelect
export type NewProductComponent = typeof productComponents.$inferInsert
