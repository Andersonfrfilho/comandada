import { pgTable, uuid, text, jsonb, timestamp, numeric } from 'drizzle-orm/pg-core'
import { orders } from './orders'
import { establishments } from './establishments'
import { users } from './users'
import { deliveryStatusEnum } from './enums'

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  delivererId: uuid('deliverer_id').references(() => users.id, { onDelete: 'set null' }),
  status: deliveryStatusEnum('status').default('pending').notNull(),
  addressSnapshot: jsonb('address_snapshot').notNull(),
  // Taxa e distância no momento da criação — snapshot, não cálculo ao vivo: mudar a regra de
  // preço depois não pode alterar o valor já cobrado do cliente num pedido antigo.
  feeAmount: numeric('fee_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  distanceKm: numeric('distance_km', { precision: 6, scale: 2 }),
  notes: text('notes'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Delivery = typeof deliveries.$inferSelect
export type NewDelivery = typeof deliveries.$inferInsert
