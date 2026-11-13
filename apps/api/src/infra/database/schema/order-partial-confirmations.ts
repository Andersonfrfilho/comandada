import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { orders } from './orders'
import { users } from './users'

// Pergunta de confirmação parcial enviada ao cliente. status: pending | accepted | declined | superseded.
export const orderPartialConfirmations = pgTable(
  'order_partial_confirmations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    unavailableItemIds: jsonb('unavailable_item_ids').$type<string[]>().notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orderStatusIdx: index('order_partial_confirmations_order_idx').on(table.orderId, table.status),
  })
)

export type OrderPartialConfirmation = typeof orderPartialConfirmations.$inferSelect
