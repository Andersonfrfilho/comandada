import { pgTable, uuid, varchar, text, numeric, timestamp, boolean } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { customers } from './customers'
import { restaurantTables } from './tables'
import { orderStatusEnum, orderTypeEnum, orderChannelEnum } from './enums'

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
  channel: orderChannelEnum('channel').default('manual').notNull(),
  status: orderStatusEnum('status').default('received').notNull(),
  type: orderTypeEnum('type').notNull(),
  // Itens + taxa de entrega: o que o cliente paga.
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  // Taxa de entrega já somada em `totalAmount`; a nota fiscal usa `totalAmount - deliveryFee`.
  deliveryFee: numeric('delivery_fee', { precision: 10, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  fiscalEnabled: boolean('fiscal_enabled').notNull().default(true),
  whatsappMessageId: varchar('whatsapp_message_id', { length: 255 }).unique(),
  // Short code the WhatsApp bot shows the customer (e.g. PED-20261112210121-2233); null for orders from other channels.
  code: varchar('code', { length: 40 }),
  // Retirada/entrega marcada para um horário futuro. `null` é o caso comum — pedido para agora.
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  // Horário ocupado na agenda (schema `scheduling` do SDK) quando o pedido é encomenda.
  scheduleBookingId: uuid('schedule_booking_id'),
  // Previsão dada ao cliente quando o pedido foi aceito (pronto para retirar ou entregue).
  estimatedAt: timestamp('estimated_at', { withTimezone: true }),
  // Pagamento online pelo WhatsApp: `awaiting` segura o pedido fora da cozinha até o provedor confirmar.
  // not_required | awaiting | paid | failed | refunded
  paymentStatus: varchar('payment_status', { length: 20 }).notNull().default('not_required'),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  productionStartedAt: timestamp('production_started_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  // Saiu para entrega: separa o tempo de rua do tempo de balcão nos relatórios e na previsão.
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
