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
import { deliveryFeeRules } from './delivery-fee-rules'

export const deliveryFeeZones = pgTable('delivery_fee_zones', {
  id: serial('id').primaryKey(),
  deliveryFeeRuleId: integer('delivery_fee_rule_id')
    .notNull()
    .references(() => deliveryFeeRules.id, { onDelete: 'cascade' }),
  establishmentId: uuid('establishment_id').references(() => establishments.id, {
    onDelete: 'cascade',
  }),
  zoneType: text('zone_type').notNull().default('km'),
  minValue: numeric('min_value', { precision: 10, scale: 2 }).notNull().default('0.00'),
  maxValue: numeric('max_value', { precision: 10, scale: 2 }).notNull(),
  fee: numeric('fee', { precision: 10, scale: 2 }).notNull(),
  label: text('label'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type DeliveryFeeZone = typeof deliveryFeeZones.$inferSelect
export type NewDeliveryFeeZone = typeof deliveryFeeZones.$inferInsert
