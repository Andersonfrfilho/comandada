import type { SchedulingModule } from '@adatechnology/scheduling-module'

import type { AgendaSetupService } from '../services/AgendaSetupService'
import { bookFirstFreeResource } from '../services/bookFirstFreeResource'
import { SCHEDULED_ORDER_DURATION_MINUTES, SCHEDULE_MIN_LEAD_MINUTES } from '../../shared/agenda.constant'
import { ScheduleSlotUnavailableError, ScheduleTooSoonError } from '../../shared/agenda.error'
import { toLocalDate, toLocalTime } from '../../shared/agendaTime'

export interface BookScheduledOrderParams {
  readonly establishmentId: string
  readonly scheduledFor: Date
  readonly orderCode: string
  readonly customerRef?: string | undefined
  readonly now: Date
}

export interface BookScheduledOrderResult {
  readonly bookingId: string
}

export class BookScheduledOrderUseCase {
  constructor(
    private readonly scheduling: SchedulingModule['useCases'],
    private readonly agendaSetup: AgendaSetupService
  ) {}

  async execute(params: BookScheduledOrderParams): Promise<BookScheduledOrderResult> {
    const minimumStart = params.now.getTime() + SCHEDULE_MIN_LEAD_MINUTES * 60_000
    if (params.scheduledFor.getTime() < minimumStart) throw new ScheduleTooSoonError(SCHEDULE_MIN_LEAD_MINUTES)

    const setup = await this.agendaSetup.ensure(params.establishmentId)
    const booked = await bookFirstFreeResource({
      scheduling: this.scheduling,
      companyId: params.establishmentId,
      serviceId: setup.scheduledOrderServiceId,
      resourceIds: setup.productionLineIds,
      startsAt: params.scheduledFor,
      durationMinutes: SCHEDULED_ORDER_DURATION_MINUTES,
      title: `Encomenda ${params.orderCode}`,
      customerRef: params.customerRef,
    })
    if (!booked) throw new ScheduleSlotUnavailableError(toLocalDate(params.scheduledFor), toLocalTime(params.scheduledFor))
    return { bookingId: booked.bookingId }
  }
}
