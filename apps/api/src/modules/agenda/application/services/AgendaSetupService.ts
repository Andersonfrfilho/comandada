import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Resource, ResourceKind, Service } from '@adatechnology/scheduling-contracts'
import type { SchedulingModule } from '@adatechnology/scheduling-module'

import * as schema from '@/infra/database/schema'
import {
  AGENDA_TIMEZONE,
  DEFAULT_CLOSING_TIME,
  DEFAULT_OPENING_TIME,
  DEFAULT_WORKING_DAYS,
  PRODUCTION_LINE_COUNT,
  PRODUCTION_LINE_REF_PREFIX,
  SCHEDULED_ORDER_DURATION_MINUTES,
  SCHEDULED_ORDER_SERVICE_NAME,
  TABLE_REF_PREFIX,
  TABLE_RESERVATION_DURATION_MINUTES,
  TABLE_RESERVATION_SERVICE_NAME,
  WEEKDAY_BY_ABBREVIATION,
} from '../../shared/agenda.constant'

type Database = NodePgDatabase<typeof schema>
type SchedulingUseCases = SchedulingModule['useCases']

export interface AgendaSetup {
  readonly scheduledOrderServiceId: string
  readonly productionLineIds: readonly string[]
  readonly tableReservationServiceId: string
  readonly tableResourceIdByTableId: ReadonlyMap<string, string>
}

interface EnsureResourceParams {
  readonly companyId: string
  readonly existing: ReadonlyMap<string, Resource>
  readonly externalRef: string
  readonly name: string
  readonly kind: ResourceKind
  readonly serviceId: string
}

const OPENING_HOURS_KEYS = ['opening_time', 'closing_time', 'working_days']
const SETUP_CACHE_TTL_MS = 5 * 60 * 1000
const LIST_PAGE_SIZE = 100

/**
 * Lazily mirrors the restaurant into the scheduling SDK: production lines take scheduled orders,
 * each table takes reservations. Opening hours become the weekly rule only when a resource is
 * created, so later edits made through the agenda are never overwritten.
 */
export class AgendaSetupService {
  private readonly cache = new Map<string, { expiresAt: number; setup: Promise<AgendaSetup> }>()

  constructor(
    private readonly db: Database,
    private readonly scheduling: SchedulingUseCases
  ) {}

  async ensure(establishmentId: string): Promise<AgendaSetup> {
    const cached = this.cache.get(establishmentId)
    if (cached && cached.expiresAt > Date.now()) return cached.setup
    const setup = this.build(establishmentId)
    this.cache.set(establishmentId, { expiresAt: Date.now() + SETUP_CACHE_TTL_MS, setup })
    setup.catch(() => this.cache.delete(establishmentId))
    return setup
  }

  private async build(companyId: string): Promise<AgendaSetup> {
    const services = await this.listServices(companyId)
    const scheduledOrderService = await this.ensureService({
      companyId,
      services,
      name: SCHEDULED_ORDER_SERVICE_NAME,
      durationMinutes: SCHEDULED_ORDER_DURATION_MINUTES,
    })
    const tableReservationService = await this.ensureService({
      companyId,
      services,
      name: TABLE_RESERVATION_SERVICE_NAME,
      durationMinutes: TABLE_RESERVATION_DURATION_MINUTES,
    })
    const existing = await this.listResourcesByRef(companyId)

    const productionLineIds: string[] = []
    for (let line = 1; line <= PRODUCTION_LINE_COUNT; line += 1) {
      productionLineIds.push(
        await this.ensureResource({
          companyId,
          existing,
          externalRef: `${PRODUCTION_LINE_REF_PREFIX}${line}`,
          name: `Produção ${line}`,
          kind: 'equipment',
          serviceId: scheduledOrderService.id,
        })
      )
    }

    const tables = await this.db.query.restaurantTables.findMany({
      where: eq(schema.restaurantTables.establishmentId, companyId),
    })
    const tableResourceIdByTableId = new Map<string, string>()
    for (const table of tables) {
      const resourceId = await this.ensureResource({
        companyId,
        existing,
        externalRef: `${TABLE_REF_PREFIX}${table.id}`,
        name: `Mesa ${table.number}`,
        kind: 'room',
        serviceId: tableReservationService.id,
      })
      tableResourceIdByTableId.set(table.id, resourceId)
    }

    return {
      scheduledOrderServiceId: scheduledOrderService.id,
      productionLineIds,
      tableReservationServiceId: tableReservationService.id,
      tableResourceIdByTableId,
    }
  }

  private async listServices(companyId: string): Promise<readonly Service[]> {
    const page = await this.scheduling.listServices.execute({ companyId, pageSize: LIST_PAGE_SIZE })
    return page.data
  }

  private async ensureService(params: {
    companyId: string
    services: readonly Service[]
    name: string
    durationMinutes: number
  }): Promise<Service> {
    const found = params.services.find((service) => service.name === params.name)
    if (found) return found
    return this.scheduling.createService.execute({
      companyId: params.companyId,
      input: { name: params.name, durationMinutes: params.durationMinutes, requiresConfirmation: false },
    })
  }

  private async listResourcesByRef(companyId: string): Promise<Map<string, Resource>> {
    const page = await this.scheduling.listResources.execute({ companyId, pageSize: LIST_PAGE_SIZE })
    return new Map(
      page.data.flatMap((resource) => (resource.externalRef ? [[resource.externalRef, resource] as const] : []))
    )
  }

  private async ensureResource(params: EnsureResourceParams): Promise<string> {
    const found = params.existing.get(params.externalRef)
    if (found) return found.id
    const resource = await this.scheduling.createResource.execute({
      companyId: params.companyId,
      input: { name: params.name, kind: params.kind, timezone: AGENDA_TIMEZONE, externalRef: params.externalRef },
    })
    await this.scheduling.linkResourceToService.execute({
      companyId: params.companyId,
      serviceId: params.serviceId,
      resourceId: resource.id,
    })
    await this.scheduling.setAvailabilityRules.execute({
      companyId: params.companyId,
      resourceId: resource.id,
      rules: await this.openingHourRules(params.companyId),
    })
    return resource.id
  }

  private async openingHourRules(companyId: string) {
    const rows = await this.db.query.settings.findMany({
      where: and(eq(schema.settings.establishmentId, companyId), inArray(schema.settings.key, OPENING_HOURS_KEYS)),
    })
    const valueOf = (key: string): string | undefined => {
      const value = rows.find((row) => row.key === key)?.value
      return typeof value === 'string' ? value : undefined
    }
    const opening = valueOf('opening_time') ?? DEFAULT_OPENING_TIME
    const closing = valueOf('closing_time') ?? DEFAULT_CLOSING_TIME
    // A rule cannot cross midnight; a late closing is clipped to the end of the day.
    const endsAtLocal = closing > opening ? closing : '23:59'
    return (valueOf('working_days') ?? DEFAULT_WORKING_DAYS)
      .split(',')
      .map((day) => WEEKDAY_BY_ABBREVIATION[day.trim()])
      .filter((weekday): weekday is number => weekday !== undefined)
      .map((weekday) => ({ weekday, startsAtLocal: opening, endsAtLocal }))
  }
}
