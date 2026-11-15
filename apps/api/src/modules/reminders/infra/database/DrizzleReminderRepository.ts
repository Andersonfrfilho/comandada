import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import * as schema from '@/infra/database/schema'
import { AGENDA_TIMEZONE } from '@/modules/agenda/shared/agenda.constant'
import type { ReminderRepository, ReorderCandidate, ReservationForReminder } from '../../application/ReminderRepository'

type Database = NodePgDatabase<typeof schema>

type ReorderRow = {
  customer_id: string
  name: string
  whatsapp_number: string
  last_order_at: Date | string
  top_item: string | null
  last_marketing_at: Date | string | null
}

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value))

export class DrizzleReminderRepository implements ReminderRepository {
  constructor(private readonly db: Database) {}

  async listEstablishments(): Promise<Array<{ id: string; name: string }>> {
    return this.db.select({ id: schema.establishments.id, name: schema.establishments.name }).from(schema.establishments)
  }

  async settingsFor(establishmentId: string): Promise<Record<string, unknown>> {
    const rows = await this.db.query.settings.findMany({ where: eq(schema.settings.establishmentId, establishmentId) })
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  }

  // O telefone vem do cliente vinculado ao pedido (orders.customer_id), não de uma coluna no pedido.
  async findReorderCandidates(params: {
    establishmentId: string
    intervalDays: number
    minGapDays: number
    now: Date
    limit: number
  }): Promise<ReorderCandidate[]> {
    const result = await this.db.execute<ReorderRow>(sql`
      SELECT
        c.id AS customer_id,
        c.name,
        c.whatsapp_number,
        o.created_at AS last_order_at,
        (
          SELECT oi.product_name FROM order_items oi
          WHERE oi.order_id = o.id
          ORDER BY oi.quantity DESC, oi.created_at ASC
          LIMIT 1
        ) AS top_item,
        c.last_marketing_at
      FROM customers c
      JOIN LATERAL (
        SELECT id, created_at FROM orders
        WHERE orders.customer_id = c.id
          AND orders.establishment_id = c.establishment_id
          AND orders.status <> 'cancelled'
        ORDER BY created_at DESC
        LIMIT 1
      ) o ON true
      WHERE c.establishment_id = ${params.establishmentId}
        AND c.marketing_opt_in = true
        AND (c.last_marketing_at IS NULL OR c.last_marketing_at < ${params.now}::timestamptz - make_interval(days => ${params.minGapDays}::int))
        AND (o.created_at AT TIME ZONE ${AGENDA_TIMEZONE})::date
          = (${params.now}::timestamptz AT TIME ZONE ${AGENDA_TIMEZONE})::date - ${params.intervalDays}::int
      ORDER BY o.created_at DESC
      LIMIT ${params.limit}
    `)
    return result.rows.map((row) => ({
      customerId: row.customer_id,
      name: row.name,
      whatsappNumber: row.whatsapp_number,
      lastOrderAt: toDate(row.last_order_at),
      topItem: row.top_item,
      previousMarketingAt: row.last_marketing_at ? toDate(row.last_marketing_at) : null,
    }))
  }

  async claimReorderReminder(params: { customerId: string; minGapDays: number; now: Date }): Promise<boolean> {
    const claimed = await this.db
      .update(schema.customers)
      .set({ lastMarketingAt: params.now })
      .where(
        and(
          eq(schema.customers.id, params.customerId),
          sql`(${schema.customers.lastMarketingAt} IS NULL OR ${schema.customers.lastMarketingAt} < ${params.now}::timestamptz - make_interval(days => ${params.minGapDays}::int))`
        )
      )
      .returning({ id: schema.customers.id })
    return claimed.length > 0
  }

  async releaseReorderReminder(params: { customerId: string; previousMarketingAt: Date | null }): Promise<void> {
    await this.db
      .update(schema.customers)
      .set({ lastMarketingAt: params.previousMarketingAt })
      .where(eq(schema.customers.id, params.customerId))
  }

  async findReservationByBooking(params: {
    establishmentId: string
    bookingId: string
  }): Promise<ReservationForReminder | null> {
    const reservation = await this.db.query.tableReservations.findFirst({
      where: and(
        eq(schema.tableReservations.establishmentId, params.establishmentId),
        eq(schema.tableReservations.bookingId, params.bookingId)
      ),
    })
    if (!reservation?.customerId) return null
    const customer = await this.db.query.customers.findFirst({
      where: and(
        eq(schema.customers.id, reservation.customerId),
        eq(schema.customers.establishmentId, params.establishmentId)
      ),
    })
    if (!customer) return null
    return {
      code: reservation.code,
      partySize: reservation.partySize,
      startsAt: reservation.startsAt,
      createdAt: reservation.createdAt,
      customerName: customer.name,
      whatsappNumber: customer.whatsappNumber,
    }
  }
}
