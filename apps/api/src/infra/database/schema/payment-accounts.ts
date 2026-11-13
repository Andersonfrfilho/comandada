import { pgTable, uuid, varchar, text, boolean, integer, timestamp, unique } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

// Conta de recebimento online de cada restaurante (Mercado Pago hoje). O dinheiro cai direto nela.
// `credentials` é JSON cifrado com SecretCipher (access token e assinatura do webhook): nunca volta para o painel.
export const paymentAccounts = pgTable(
  'payment_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 30 }).notNull(),
    credentials: text('credentials').notNull(),
    // Últimos caracteres do token, só para o painel mostrar qual conta está ligada.
    accessTokenHint: varchar('access_token_hint', { length: 12 }),
    // O Pix do Mercado Pago exige e-mail do pagador; quem compra pelo WhatsApp quase nunca tem.
    payerEmail: varchar('payer_email', { length: 255 }),
    pixEnabled: boolean('pix_enabled').notNull().default(true),
    cardLinkEnabled: boolean('card_link_enabled').notNull().default(true),
    expirationMinutes: integer('expiration_minutes').notNull().default(30),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('payment_accounts_establishment_provider_unique').on(table.establishmentId, table.provider)]
)

export type PaymentAccount = typeof paymentAccounts.$inferSelect
export type NewPaymentAccount = typeof paymentAccounts.$inferInsert
