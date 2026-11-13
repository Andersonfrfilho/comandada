import { pgTable, uuid, varchar, numeric, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { sections } from './sections'

export const ingredients = pgTable('ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  unit: varchar('unit', { length: 20 }).default('un').notNull(),
  costPerUnit: numeric('cost_per_unit', { precision: 10, scale: 4 }).default('0').notNull(),
  stockQuantity: numeric('stock_quantity', { precision: 10, scale: 4 }).default('0').notNull(),
  minimumStock: numeric('minimum_stock', { precision: 10, scale: 4 }),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Ingredient = typeof ingredients.$inferSelect
export type NewIngredient = typeof ingredients.$inferInsert
