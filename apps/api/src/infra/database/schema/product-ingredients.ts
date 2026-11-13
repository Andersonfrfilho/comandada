import { pgTable, uuid, varchar, text, numeric, timestamp } from 'drizzle-orm/pg-core'
import { products } from './products'
import { ingredients } from './ingredients'

export const productIngredients = pgTable('product_ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  ingredientId: uuid('ingredient_id')
    .notNull()
    .references(() => ingredients.id, { onDelete: 'cascade' }),
  quantity: numeric('quantity', { precision: 10, scale: 4 }).notNull(),
  unit: varchar('unit', { length: 20 }).default('un').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ProductIngredient = typeof productIngredients.$inferSelect
export type NewProductIngredient = typeof productIngredients.$inferInsert
