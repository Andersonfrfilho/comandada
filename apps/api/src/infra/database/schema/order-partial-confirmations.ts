import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { orders } from './orders'
import { users } from './users'

/** Produto oferecido no lugar de um item em falta (preço do cadastro no momento da pergunta). */
export interface PartialSubstituteProduct {
  productId: string
  productName: string
  unitPrice: number
}

/** Troca sugerida pela equipe para um item em falta, com as outras opções do mesmo tipo. */
export interface PartialSubstitution {
  itemId: string
  suggested: PartialSubstituteProduct
  alternatives: PartialSubstituteProduct[]
}

// Pergunta de confirmação parcial enviada ao cliente. status: pending | accepted | declined | superseded.
export const orderPartialConfirmations = pgTable(
  'order_partial_confirmations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    unavailableItemIds: jsonb('unavailable_item_ids').$type<string[]>().notNull(),
    substitutions: jsonb('substitutions').$type<PartialSubstitution[]>().notNull().default([]),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orderStatusIdx: index('order_partial_confirmations_order_idx').on(table.orderId, table.status),
  })
)

export type OrderPartialConfirmation = typeof orderPartialConfirmations.$inferSelect
