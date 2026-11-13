import { pgTable, uuid, text, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const establishments = pgTable('establishments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  whatsappNumber: varchar('whatsapp_number', { length: 20 }).unique(),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Establishment = typeof establishments.$inferSelect
export type NewEstablishment = typeof establishments.$inferInsert
