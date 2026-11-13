import { pgTable, uuid, varchar, integer, numeric, text, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const monthlyAccounts = pgTable('monthly_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).notNull().default('outros'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  dueDay: integer('due_day').notNull(),
  recurrence: varchar('recurrence', { length: 20 }).notNull().default('monthly'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type MonthlyAccount = typeof monthlyAccounts.$inferSelect
export type NewMonthlyAccount = typeof monthlyAccounts.$inferInsert
