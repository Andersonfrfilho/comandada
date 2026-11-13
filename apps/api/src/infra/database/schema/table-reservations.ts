import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { customers } from './customers'
import { restaurantTables } from './tables'

// The time slot itself lives in the scheduling SDK (booking); this row keeps what the restaurant needs.
export const tableReservations = pgTable('table_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
  code: varchar('code', { length: 40 }).notNull(),
  partySize: integer('party_size').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type TableReservation = typeof tableReservations.$inferSelect
export type NewTableReservation = typeof tableReservations.$inferInsert
