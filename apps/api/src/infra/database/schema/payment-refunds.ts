import { pgTable, uuid, varchar, text, numeric, timestamp, index } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { orders } from './orders'
import { paymentCharges } from './payment-charges'
import { users } from './users'

// Devolução de dinheiro de um pedido. `online` passa pelo provedor (Pix/link de cartão); `manual` é a
// equipe devolvendo no balcão (dinheiro, estorno na maquininha) e só fica registrada aqui e no caixa.
export const paymentRefunds = pgTable(
  'payment_refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    chargeId: uuid('charge_id').references(() => paymentCharges.id, { onDelete: 'set null' }),
    // online | manual
    method: varchar('method', { length: 20 }).notNull(),
    provider: varchar('provider', { length: 30 }),
    providerRefundId: varchar('provider_refund_id', { length: 100 }),
    // Forma de pagamento do caixa de onde o dinheiro sai (pix, card_credit, cash...).
    paymentMethod: varchar('payment_method', { length: 20 }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    // processing | approved | pending | failed
    status: varchar('status', { length: 20 }).notNull(),
    reason: text('reason'),
    failureMessage: text('failure_message'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('payment_refunds_order_idx').on(table.orderId)]
)

export type PaymentRefund = typeof paymentRefunds.$inferSelect
export type NewPaymentRefund = typeof paymentRefunds.$inferInsert
