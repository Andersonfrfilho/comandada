import { pgTable, uuid, varchar, text, numeric, timestamp, unique, index } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { orders } from './orders'

// Cobrança enviada ao cliente no WhatsApp (Pix ou link de cartão). O webhook do provedor muda o status.
export const paymentCharges = pgTable(
  'payment_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 30 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(),
    providerChargeId: varchar('provider_charge_id', { length: 100 }).notNull(),
    // No link de cartão a cobrança é uma preferência; o pagamento que nasce dela tem outro id.
    providerPaymentId: varchar('provider_payment_id', { length: 100 }),
    status: varchar('status', { length: 20 }).notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    pixCopyPaste: text('pix_copy_paste'),
    paymentUrl: text('payment_url'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('payment_charges_provider_charge_unique').on(table.provider, table.providerChargeId),
    index('payment_charges_order_idx').on(table.orderId),
  ]
)

export type PaymentCharge = typeof paymentCharges.$inferSelect
export type NewPaymentCharge = typeof paymentCharges.$inferInsert
