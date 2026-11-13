import {
  pgTable,
  serial,
  integer,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const deliveryFeeRules = pgTable('delivery_fee_rules', {
  id: serial('id').primaryKey(),
  orderTypeId: integer('order_type_id').notNull(),
  establishmentId: uuid('establishment_id').references(() => establishments.id, {
    onDelete: 'cascade',
  }),
  mode: text('mode').notNull().default('fixed'),
  baseFee: numeric('base_fee', { precision: 10, scale: 2 }).notNull().default('0.00'),
  perKmRate: numeric('per_km_rate', { precision: 10, scale: 2 }).notNull().default('0.00'),
  perMinRate: numeric('per_min_rate', { precision: 10, scale: 2 }).notNull().default('0.00'),
  freeAbove: numeric('free_above', { precision: 10, scale: 2 }).notNull().default('0.00'),
  maxRadiusKm: numeric('max_radius_km', { precision: 10, scale: 2 }).notNull().default('10.00'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type DeliveryFeeRule = typeof deliveryFeeRules.$inferSelect
export type NewDeliveryFeeRule = typeof deliveryFeeRules.$inferInsert
