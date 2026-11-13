import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const sections = pgTable('sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Section = typeof sections.$inferSelect
export type NewSection = typeof sections.$inferInsert
