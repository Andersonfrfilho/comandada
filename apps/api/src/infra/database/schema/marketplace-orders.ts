import { pgTable, uuid, varchar, timestamp, jsonb, unique, primaryKey } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { orders } from './orders'

// Pedido de marketplace (iFood, 99Food) ligado ao pedido do painel. `platformStatus` é o último status
// que a plataforma conhece: o aviso de status do painel só sai quando muda, e o cancelamento que veio
// da plataforma não volta para ela.
export const marketplaceOrders = pgTable(
  'marketplace_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 20 }).notNull(),
    externalId: varchar('external_id', { length: 100 }).notNull(),
    displayId: varchar('display_id', { length: 40 }),
    merchantId: varchar('merchant_id', { length: 100 }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    platformStatus: varchar('platform_status', { length: 30 }).notNull().default('placed'),
    deliveredBy: varchar('delivered_by', { length: 20 }),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('marketplace_orders_unique').on(table.platform, table.externalId)]
)

// Eventos já tratados: polling e webhook podem entregar o mesmo evento de novo.
export const marketplaceEvents = pgTable(
  'marketplace_events',
  {
    platform: varchar('platform', { length: 20 }).notNull(),
    eventId: varchar('event_id', { length: 100 }).notNull(),
    eventCode: varchar('event_code', { length: 40 }).notNull(),
    externalOrderId: varchar('external_order_id', { length: 100 }),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.platform, table.eventId] })]
)

export type MarketplaceOrderRow = typeof marketplaceOrders.$inferSelect
