import { pgTable, uuid, varchar, jsonb, timestamp, unique } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const settings = pgTable(
  'settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 100 }).notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('settings_establishment_key_unique').on(t.establishmentId, t.key)]
)

export type Setting = typeof settings.$inferSelect
export type NewSetting = typeof settings.$inferInsert
