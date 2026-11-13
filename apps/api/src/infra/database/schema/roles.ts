import { pgTable, uuid, varchar, text, unique } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    description: text('description'),
  },
  (t) => [unique('roles_establishment_name_unique').on(t.establishmentId, t.name)]
)

export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
