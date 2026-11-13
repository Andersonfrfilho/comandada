import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { restaurantTables } from './tables'
import { customers } from './customers'
import { comandaStatusEnum } from './enums'

export const comandas = pgTable('comandas', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id')
    .notNull()
    .references(() => restaurantTables.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 10 }).notNull(),
  status: comandaStatusEnum('status').default('open').notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  customerName: varchar('customer_name', { length: 255 }),
  customerPhone: varchar('customer_phone', { length: 20 }),
  customerDocument: varchar('customer_document', { length: 20 }),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
})

export type Comanda = typeof comandas.$inferSelect
export type NewComanda = typeof comandas.$inferInsert
