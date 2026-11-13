import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

type Database = NodePgDatabase<typeof schema>

export interface PaymentTypeRow {
  id: number
  name: string
  type: string
  label: string
  // PIX carries { chave, nome } here; the bot shows it to the customer.
  config: Record<string, unknown>
}

export interface OrderTypeRow {
  id: number
  name: string
  type: string
  label: string
}

export interface DeliveryFeeZoneRow {
  zoneType: 'km' | 'min'
  minValue: number
  maxValue: number
  fee: number
  label: string | null
}

export interface DeliveryFeeRuleRow {
  id: number
  mode: string
  baseFee: number
  perKmRate: number
  perMinRate: number
  freeAbove: number
  maxRadiusKm: number
  zones: DeliveryFeeZoneRow[]
}

export interface EstablishmentCoordinates {
  lat: number
  lng: number
  address: string | null
}

export class BotConfigRepository {
  constructor(private readonly db: Database) {}

  async listActivePaymentTypes(): Promise<PaymentTypeRow[]> {
    const result = await this.db.execute(sql`
      SELECT id, name, type, label, COALESCE(config, '{}'::jsonb) AS config
      FROM payment_types
      WHERE active = true AND deleted_at IS NULL
      ORDER BY id
    `)
    return result.rows as unknown as PaymentTypeRow[]
  }

  async listActiveOrderTypes(): Promise<OrderTypeRow[]> {
    const result = await this.db.execute(sql`
      SELECT id, name, type, label
      FROM order_types
      WHERE active = true AND deleted_at IS NULL
      ORDER BY id
    `)
    return result.rows as unknown as OrderTypeRow[]
  }

  async getActiveDeliveryFeeRule(): Promise<DeliveryFeeRuleRow | null> {
    const ruleResult = await this.db.execute(sql`
      SELECT
        r.id AS "id",
        r.mode AS "mode",
        r.base_fee::float8 AS "baseFee",
        r.per_km_rate::float8 AS "perKmRate",
        r.per_min_rate::float8 AS "perMinRate",
        r.free_above::float8 AS "freeAbove",
        r.max_radius_km::float8 AS "maxRadiusKm"
      FROM delivery_fee_rules r
      JOIN order_types o ON o.id = r.order_type_id
      WHERE o.name = 'delivery' AND r.active = true AND r.deleted_at IS NULL
      ORDER BY r.id
      LIMIT 1
    `)
    const rule = ruleResult.rows[0] as Omit<DeliveryFeeRuleRow, 'zones'> | undefined
    if (!rule) return null

    const zonesResult = await this.db.execute(sql`
      SELECT
        zone_type AS "zoneType",
        min_value::float8 AS "minValue",
        max_value::float8 AS "maxValue",
        fee::float8 AS "fee",
        label AS "label"
      FROM delivery_fee_zones
      WHERE delivery_fee_rule_id = ${rule.id} AND active = true AND deleted_at IS NULL
      ORDER BY min_value
    `)

    return { ...rule, zones: zonesResult.rows as unknown as DeliveryFeeZoneRow[] }
  }

  async getEstablishmentCoordinates(): Promise<EstablishmentCoordinates> {
    const result = await this.db.execute(sql`
      SELECT key, value
      FROM bot_settings
      WHERE key IN ('establishment_lat', 'establishment_lng', 'establishment_address')
    `)
    const rows = result.rows as { key: string; value: string }[]
    const settings = new Map(rows.map((row) => [row.key, row.value]))
    return {
      lat: Number(settings.get('establishment_lat') ?? 0),
      lng: Number(settings.get('establishment_lng') ?? 0),
      address: settings.get('establishment_address') ?? null,
    }
  }
}
