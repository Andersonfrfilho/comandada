import { pgTable, uuid, numeric, text, timestamp } from 'drizzle-orm/pg-core'
import { cashRegisters } from './cash-registers'
import { orders } from './orders'
import { cashMovementTypeEnum, paymentMethodEnum } from './enums'

export const cashMovements = pgTable('cash_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  cashRegisterId: uuid('cash_register_id')
    .notNull()
    .references(() => cashRegisters.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  type: cashMovementTypeEnum('type').notNull(),
  paymentMethod: paymentMethodEnum('payment_method'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type CashMovement = typeof cashMovements.$inferSelect
export type NewCashMovement = typeof cashMovements.$inferInsert
