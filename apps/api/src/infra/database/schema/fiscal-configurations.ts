import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core'
import { fiscalModelEnum } from './enums'
import { establishments } from './establishments'

export const fiscalConfigurations = pgTable('fiscal_configurations', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .unique()
    .references(() => establishments.id, { onDelete: 'cascade' }),

  model: fiscalModelEnum('model').notNull().default('none'),

  cnpj: varchar('cnpj', { length: 18 }),
  inscricaoEstadual: varchar('inscricao_estadual', { length: 50 }),
  razaoSocial: varchar('razao_social', { length: 255 }),
  uf: varchar('uf', { length: 2 }),
  municipio: varchar('municipio', { length: 100 }),
  cep: varchar('cep', { length: 9 }),
  logradouro: text('logradouro'),
  numero: varchar('numero', { length: 20 }),
  complemento: varchar('complemento', { length: 100 }),
  bairro: varchar('bairro', { length: 100 }),
  crt: varchar('crt', { length: 1 }).default('1'),

  providerConfig: jsonb('provider_config').default({}),

  environment: varchar('environment', { length: 20 }).notNull().default('homologacao'),

  // Quando emitir a NF: 'on_payment' | 'on_completed' | 'manual'
  emitTrigger: varchar('emit_trigger', { length: 20 }).notNull().default('on_payment'),
  // Provider de e-mail p/ envio ao cliente: 'resend' | 'smtp'
  emailProvider: varchar('email_provider', { length: 20 }).notNull().default('resend'),

  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type FiscalConfiguration = typeof fiscalConfigurations.$inferSelect
export type NewFiscalConfiguration = typeof fiscalConfigurations.$inferInsert
