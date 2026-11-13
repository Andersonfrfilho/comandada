import { pgTable, uuid, varchar, numeric, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { ingredients } from './ingredients'

export const stockBatches = pgTable('stock_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  ingredientId: uuid('ingredient_id')
    .notNull()
    .references(() => ingredients.id, { onDelete: 'cascade' }),
  batchNumber: varchar('batch_number', { length: 100 }).notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 4 }).notNull(),
  remainingQuantity: numeric('remaining_quantity', { precision: 10, scale: 4 }).notNull(),
  costPerUnit: numeric('cost_per_unit', { precision: 10, scale: 4 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type StockBatch = typeof stockBatches.$inferSelect
export type NewStockBatch = typeof stockBatches.$inferInsert
