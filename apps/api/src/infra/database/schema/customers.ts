import { pgTable, uuid, varchar, timestamp, date, integer } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  whatsappNumber: varchar('whatsapp_number', { length: 20 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  document: varchar('document', { length: 20 }),
  birthDate: date('birth_date'),
  rating: integer('rating'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
