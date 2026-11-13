import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { orders } from './orders'
import { customers } from './customers'
import { users } from './users'

// Problema relatado pelo cliente (hoje pelo WhatsApp). `orderId` é nulo quando a queixa não é
// sobre um pedido específico. `category` usa os ids de ORDER_ISSUE_CATEGORIES.
export const orderIssues = pgTable(
  'order_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    category: varchar('category', { length: 40 }).notNull(),
    description: text('description'),
    channel: varchar('channel', { length: 20 }).notNull().default('whatsapp'),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    establishmentCreatedIdx: index('order_issues_establishment_created_idx').on(table.establishmentId, table.createdAt),
  })
)

export type OrderIssue = typeof orderIssues.$inferSelect
export type NewOrderIssue = typeof orderIssues.$inferInsert
