import { pgTable, uuid, varchar, text, numeric, boolean, integer, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { catalogs } from './catalogs'
import { sections } from './sections'

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  catalogId: uuid('category_id').references(() => catalogs.id, { onDelete: 'set null' }),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  costPrice: numeric('cost_price', { precision: 10, scale: 2 }),
  unit: varchar('unit', { length: 20 }).default('un').notNull(),
  barcode: varchar('barcode', { length: 20 }),
  preparationTimeMinutes: integer('preparation_time_minutes'),
  preparationInstructions: text('preparation_instructions'),
  /** Kit/combo: não tem receita própria, a baixa expande nos componentes. */
  isKit: boolean('is_kit').default(false).notNull(),
  active: boolean('active').default(true).notNull(),
  allowNegativeStock: boolean('allow_negative_stock').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  // Mesmo grupo = mesmo item em tamanhos diferentes (ex.: temaki médio e grande).
  variantGroup: varchar('variant_group', { length: 80 }),
  variantLabel: varchar('variant_label', { length: 40 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
