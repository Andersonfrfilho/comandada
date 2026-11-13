import { and, asc, eq, gte } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { SchedulingModule } from '@adatechnology/scheduling-module'

import * as schema from '@/infra/database/schema'
import type { AgendaSetupService } from '../services/AgendaSetupService'
import { bookFirstFreeResource } from '../services/bookFirstFreeResource'
import { TABLE_RESERVATION_DURATION_MINUTES } from '../../shared/agenda.constant'
import { NoTableAvailableError, ScheduleTooSoonError } from '../../shared/agenda.error'

type Database = NodePgDatabase<typeof schema>

export interface ReserveTableParams {
  readonly establishmentId: string
  readonly customerId: string
  readonly code: string
  readonly startsAt: Date
  readonly partySize: number
  readonly now: Date
}

export interface ReserveTableResult {
  readonly id: string
  readonly code: string
  readonly tableNumber: number
  readonly startsAt: Date
}

export class ReserveTableUseCase {
  constructor(
    private readonly db: Database,
    private readonly scheduling: SchedulingModule['useCases'],
    private readonly agendaSetup: AgendaSetupService
  ) {}

  async execute(params: ReserveTableParams): Promise<ReserveTableResult> {
    if (params.startsAt <= params.now) throw new ScheduleTooSoonError(0)
    const setup = await this.agendaSetup.ensure(params.establishmentId)
    // Smallest table that fits first, so a couple does not take the table for eight.
    const tables = await this.db.query.restaurantTables.findMany({
      where: and(
        eq(schema.restaurantTables.establishmentId, params.establishmentId),
        gte(schema.restaurantTables.capacity, params.partySize)
      ),
      orderBy: [asc(schema.restaurantTables.capacity), asc(schema.restaurantTables.number)],
    })
    const candidates = tables.flatMap((table) => {
      const resourceId = setup.tableResourceIdByTableId.get(table.id)
      return resourceId ? [{ table, resourceId }] : []
    })
    const booked = await bookFirstFreeResource({
      scheduling: this.scheduling,
      companyId: params.establishmentId,
      serviceId: setup.tableReservationServiceId,
      resourceIds: candidates.map((candidate) => candidate.resourceId),
      startsAt: params.startsAt,
      durationMinutes: TABLE_RESERVATION_DURATION_MINUTES,
      title: `Reserva ${params.code} (${params.partySize} pessoas)`,
      customerRef: params.customerId,
    })
    const table = candidates.find((candidate) => candidate.resourceId === booked?.resourceId)?.table
    if (!booked || !table) throw new NoTableAvailableError(params.partySize)

    const [reservation] = await this.db
      .insert(schema.tableReservations)
      .values({
        establishmentId: params.establishmentId,
        bookingId: booked.bookingId,
        customerId: params.customerId,
        tableId: table.id,
        code: params.code,
        partySize: params.partySize,
        startsAt: params.startsAt,
      })
      .returning({ id: schema.tableReservations.id })
    if (!reservation) throw new NoTableAvailableError(params.partySize)
    return { id: reservation.id, code: params.code, tableNumber: table.number, startsAt: params.startsAt }
  }
}
