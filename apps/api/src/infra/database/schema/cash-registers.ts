import { pgTable, uuid, numeric, text, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { users } from './users'
import { cashRegisterStatusEnum } from './enums'

export const cashRegisters = pgTable('cash_registers', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  status: cashRegisterStatusEnum('status').default('open').notNull(),
  openingAmount: numeric('opening_amount', { precision: 10, scale: 2 }).notNull(),
  closingAmount: numeric('closing_amount', { precision: 10, scale: 2 }),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  // Fechamento: só dinheiro conta para a gaveta. Diferença = contado - esperado (negativo é falta).
  expectedCashAmount: numeric('expected_cash_amount', { precision: 10, scale: 2 }),
  closingDifference: numeric('closing_difference', { precision: 10, scale: 2 }),
  closedByUserId: uuid('closed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  closingNotes: text('closing_notes'),
})

export type CashRegister = typeof cashRegisters.$inferSelect
export type NewCashRegister = typeof cashRegisters.$inferInsert
