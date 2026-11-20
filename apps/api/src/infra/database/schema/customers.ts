import { pgTable, uuid, varchar, timestamp, date, integer, boolean } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  whatsappNumber: varchar('whatsapp_number', { length: 20 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  // Nome do perfil do WhatsApp (contacts[].profile.name do webhook da Meta), como o cliente escreveu.
  // Atualizado a cada mensagem; `name` só herda dele enquanto ainda é o número.
  whatsappProfileName: varchar('whatsapp_profile_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  document: varchar('document', { length: 20 }),
  birthDate: date('birth_date'),
  rating: integer('rating'),
  // Resposta do cliente à pergunta do bot sobre novidades; nulo enquanto não foi perguntado.
  marketingOptIn: boolean('marketing_opt_in'),
  marketingOptInAt: timestamp('marketing_opt_in_at', { withTimezone: true }),
  // Último lembrete de marketing enviado (workflow 04): segura o intervalo mínimo entre lembretes.
  lastMarketingAt: timestamp('last_marketing_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
