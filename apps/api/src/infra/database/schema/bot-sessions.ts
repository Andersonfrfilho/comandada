import { pgTable, uuid, varchar, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

// Conversation state of the WhatsApp bot, one row per customer number per establishment.
export const botSessions = pgTable(
  'bot_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    whatsappNumber: varchar('whatsapp_number', { length: 20 }).notNull(),
    state: varchar('state', { length: 50 }).notNull().default('start'),
    cart: jsonb('cart').notNull().default({}),
    reservationDraft: jsonb('reservation_draft').notNull().default({}),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('bot_sessions_establishment_number_idx').on(table.establishmentId, table.whatsappNumber)]
)

export type BotSession = typeof botSessions.$inferSelect
