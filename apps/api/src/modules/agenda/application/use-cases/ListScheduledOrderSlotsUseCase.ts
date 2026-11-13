import type { SchedulingModule } from '@adatechnology/scheduling-module'

import type { AgendaSetupService } from '../services/AgendaSetupService'
import { SCHEDULE_LOOKAHEAD_DAYS, SCHEDULE_MIN_LEAD_MINUTES } from '../../shared/agenda.constant'
import { addDays, startOfLocalDay, toLocalDate, toLocalTime } from '../../shared/agendaTime'

export interface ListScheduledOrderSlotsParams {
  readonly establishmentId: string
  readonly now: Date
}

export interface ScheduledOrderDay {
  readonly date: string
  readonly times: readonly string[]
}

// Free pickup/delivery times for the next days: a time is free while any production line is free.
export class ListScheduledOrderSlotsUseCase {
  constructor(
    private readonly scheduling: SchedulingModule['useCases'],
    private readonly agendaSetup: AgendaSetupService
  ) {}

  async execute(params: ListScheduledOrderSlotsParams): Promise<ScheduledOrderDay[]> {
    const setup = await this.agendaSetup.ensure(params.establishmentId)
    const today = toLocalDate(params.now)
    const from = new Date(params.now.getTime() + SCHEDULE_MIN_LEAD_MINUTES * 60_000)
    const until = startOfLocalDay(addDays(today, SCHEDULE_LOOKAHEAD_DAYS))
    const perLine = await Promise.all(
      setup.productionLineIds.map((resourceId) =>
        this.scheduling.listAvailableSlots.execute({
          companyId: params.establishmentId,
          resourceId,
          serviceId: setup.scheduledOrderServiceId,
          from,
          until,
        })
      )
    )
    const timesByDate = new Map<string, Set<string>>()
    for (const slot of perLine.flat()) {
      if (slot.startsAt < from) continue
      const date = toLocalDate(slot.startsAt)
      const times = timesByDate.get(date) ?? new Set<string>()
      times.add(toLocalTime(slot.startsAt))
      timesByDate.set(date, times)
    }
    return [...timesByDate.entries()]
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, times]) => ({ date, times: [...times].sort() }))
  }
}
