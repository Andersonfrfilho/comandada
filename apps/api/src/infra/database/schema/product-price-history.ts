import { pgTable, uuid, numeric, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { products } from './products'
import { users } from './users'

export const productPriceHistory = pgTable('product_price_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  previousPrice: numeric('previous_price', { precision: 10, scale: 2 }).notNull(),
  newPrice: numeric('new_price', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ProductPriceHistory = typeof productPriceHistory.$inferSelect
export type NewProductPriceHistory = typeof productPriceHistory.$inferInsert
