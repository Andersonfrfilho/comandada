import { pgTable, uuid, varchar, numeric, timestamp } from 'drizzle-orm/pg-core'
import { orders } from './orders'

export const orderPayments = pgTable('order_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  paymentTypeName: varchar('payment_type_name', { length: 50 }).notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  changeFor: numeric('change_for', { precision: 10, scale: 2 }),
  splitLabel: varchar('split_label', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type OrderPayment = typeof orderPayments.$inferSelect
export type NewOrderPayment = typeof orderPayments.$inferInsert
