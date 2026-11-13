import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { orders } from './orders'

// Idempotência do webhook de pagamento: o provedor reenvia, e cada evento só pode mexer no pedido uma vez.
export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 30 }).notNull(),
    eventId: varchar('event_id', { length: 150 }).notNull(),
    type: varchar('type', { length: 40 }).notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('payment_webhook_events_unique').on(table.establishmentId, table.provider, table.eventId)]
)

export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect
