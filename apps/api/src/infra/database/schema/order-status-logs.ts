import { pgTable, serial, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { orders } from './orders'
import { establishments } from './establishments'
import { users } from './users'
import type { OrderStatus } from '@/shared/types'

// status/previousStatus são `text`, não o pgEnum `order_status`, para bater com o tipo físico
// legado (`status TEXT NOT NULL` em database/schema.sql) — scripts/seed-bot-tables.sh insere
// literais de string via UNION ALL, o que quebra contra uma coluna de enum nativo do Postgres.
export const orderStatusLogs = pgTable('order_status_logs', {
  id: serial('id').primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
  establishmentId: uuid('establishment_id').references(() => establishments.id, { onDelete: 'cascade' }),
  status: text('status').$type<OrderStatus>().notNull(),
  previousStatus: text('previous_status').$type<OrderStatus>(),
  note: text('note'),
  changedByUserId: uuid('changed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type OrderStatusLog = typeof orderStatusLogs.$inferSelect
export type NewOrderStatusLog = typeof orderStatusLogs.$inferInsert
