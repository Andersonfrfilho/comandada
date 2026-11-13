import { and, asc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { SchedulingModule } from '@adatechnology/scheduling-module'

import * as schema from '@/infra/database/schema'
import { addDays, startOfLocalDay, toLocalTime } from '../../shared/agendaTime'

type Database = NodePgDatabase<typeof schema>

export interface GetAgendaDayParams {
  readonly establishmentId: string
  readonly date: string
}

export interface AgendaScheduledOrder {
  readonly id: string
  readonly code: string | null
  readonly time: string
  readonly type: string
  readonly status: string
  readonly totalAmount: string
  readonly customerName: string | null
  readonly itemsSummary: string
}

export interface AgendaReservation {
  readonly id: string
  readonly code: string
  readonly time: string
  readonly partySize: number
  readonly tableNumber: number | null
  readonly customerName: string | null
  readonly status: string
}

export interface AgendaDay {
  readonly date: string
  readonly scheduledOrders: AgendaScheduledOrder[]
  readonly reservations: AgendaReservation[]
}

const RESERVATION_PAGE_SIZE = 100

export class GetAgendaDayUseCase {
  constructor(
    private readonly db: Database,
    private readonly scheduling: SchedulingModule['useCases']
  ) {}

  async execute(params: GetAgendaDayParams): Promise<AgendaDay> {
    const from = startOfLocalDay(params.date)
    const until = startOfLocalDay(addDays(params.date, 1))
    const [scheduledOrders, reservations] = await Promise.all([
      this.loadScheduledOrders({ establishmentId: params.establishmentId, from, until }),
      this.loadReservations({ establishmentId: params.establishmentId, from, until }),
    ])
    return { date: params.date, scheduledOrders, reservations }
  }

  private async loadScheduledOrders(range: { establishmentId: string; from: Date; until: Date }) {
    const orders = await this.db.query.orders.findMany({
      where: and(
        eq(schema.orders.establishmentId, range.establishmentId),
        isNotNull(schema.orders.scheduledFor),
        gte(schema.orders.scheduledFor, range.from),
        lt(schema.orders.scheduledFor, range.until)
      ),
      with: { items: true, customer: true },
      orderBy: asc(schema.orders.scheduledFor),
    })
    return orders.map((order) => ({
      id: order.id,
      code: order.code,
      time: order.scheduledFor ? toLocalTime(order.scheduledFor) : '',
      type: order.type,
      status: order.status,
      totalAmount: order.totalAmount,
      customerName: order.customer?.name ?? null,
      itemsSummary: order.items.map((item) => `${item.quantity}× ${item.productName}`).join(', '),
    }))
  }

  private async loadReservations(range: { establishmentId: string; from: Date; until: Date }) {
    const rows = await this.db.query.tableReservations.findMany({
      where: and(
        eq(schema.tableReservations.establishmentId, range.establishmentId),
        gte(schema.tableReservations.startsAt, range.from),
        lt(schema.tableReservations.startsAt, range.until)
      ),
      orderBy: asc(schema.tableReservations.startsAt),
    })
    if (rows.length === 0) return []
    const tableIds = rows.flatMap((row) => (row.tableId ? [row.tableId] : []))
    const customerIds = rows.flatMap((row) => (row.customerId ? [row.customerId] : []))
    const [bookings, tables, customers] = await Promise.all([
      this.scheduling.listBookings.execute({
        companyId: range.establishmentId,
        from: range.from,
        until: range.until,
        pageSize: RESERVATION_PAGE_SIZE,
      }),
      tableIds.length > 0
        ? this.db.query.restaurantTables.findMany({ where: inArray(schema.restaurantTables.id, tableIds) })
        : Promise.resolve([]),
      customerIds.length > 0
        ? this.db.query.customers.findMany({ where: inArray(schema.customers.id, customerIds) })
        : Promise.resolve([]),
    ])
    const statusByBooking = new Map(bookings.data.map((booking) => [booking.id, booking.status]))
    const tableNumberById = new Map(tables.map((table) => [table.id, table.number]))
    const customerNameById = new Map(customers.map((customer) => [customer.id, customer.name]))
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      time: toLocalTime(row.startsAt),
      partySize: row.partySize,
      tableNumber: row.tableId ? (tableNumberById.get(row.tableId) ?? null) : null,
      customerName: row.customerId ? (customerNameById.get(row.customerId) ?? null) : null,
      status: statusByBooking.get(row.bookingId) ?? 'confirmed',
    }))
  }
}
