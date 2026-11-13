import { pgTable, uuid, varchar, date, numeric, text, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).notNull().default('outros'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  expenseDate: date('expense_date').notNull().defaultNow(),
  supplier: varchar('supplier', { length: 255 }),
  receiptUrl: text('receipt_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Expense = typeof expenses.$inferSelect
export type NewExpense = typeof expenses.$inferInsert
