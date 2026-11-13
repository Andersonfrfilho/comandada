import { pgTable, uuid, varchar, numeric, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { ingredients } from './ingredients'
import { stockBatches } from './stock-batches'
import { orders } from './orders'
import { users } from './users'

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  ingredientId: uuid('ingredient_id')
    .notNull()
    .references(() => ingredients.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').references(() => stockBatches.id, { onDelete: 'set null' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  movementType: varchar('movement_type', { length: 20 }).notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 4 }).notNull(),
  reason: varchar('reason', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type StockMovement = typeof stockMovements.$inferSelect
export type NewStockMovement = typeof stockMovements.$inferInsert
