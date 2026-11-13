import { pgTable, uuid, varchar, text, numeric, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { fiscalDocumentStatusEnum, fiscalModelEnum } from './enums'
import { establishments } from './establishments'
import { orders } from './orders'

export const fiscalDocuments = pgTable('fiscal_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id')
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: 'restrict' }),

  model: fiscalModelEnum('model').notNull(),

  status: fiscalDocumentStatusEnum('status').notNull().default('pending'),

  numeroDocumento: integer('numero_documento'),
  serie: varchar('serie', { length: 5 }),
  chaveAcesso: varchar('chave_acesso', { length: 44 }).unique(),
  protocolo: varchar('protocolo', { length: 50 }),

  totalBruto: numeric('total_bruto', { precision: 10, scale: 2 }),
  totalDesconto: numeric('total_desconto', { precision: 10, scale: 2 }).default('0'),
  totalLiquido: numeric('total_liquido', { precision: 10, scale: 2 }),

  xmlAutorizado: text('xml_autorizado'),
  qrCodeUrl: text('qr_code_url'),
  danfePdfUrl: text('danfe_pdf_url'),

  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  cancellationProtocol: varchar('cancellation_protocol', { length: 50 }),

  providerResponse: jsonb('provider_response').default({}),

  errorCode: varchar('error_code', { length: 20 }),
  errorMessage: text('error_message'),

  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),

  authorizedAt: timestamp('authorized_at', { withTimezone: true }),

  // Envio ao cliente (WhatsApp/e-mail): 'sent' | 'partial' | 'failed'
  deliveryStatus: varchar('delivery_status', { length: 20 }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  deliveryError: text('delivery_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type FiscalDocument = typeof fiscalDocuments.$inferSelect
export type NewFiscalDocument = typeof fiscalDocuments.$inferInsert
