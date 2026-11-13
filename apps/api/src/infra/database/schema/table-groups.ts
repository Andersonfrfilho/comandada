import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const tableGroups = pgTable('table_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
})

export type TableGroup = typeof tableGroups.$inferSelect
export type NewTableGroup = typeof tableGroups.$inferInsert
