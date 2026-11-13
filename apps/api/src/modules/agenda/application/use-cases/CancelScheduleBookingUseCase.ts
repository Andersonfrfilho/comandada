import type { SchedulingModule } from '@adatechnology/scheduling-module'

export interface CancelScheduleBookingParams {
  readonly establishmentId: string
  readonly bookingId: string
  readonly cancelledBy: string
  readonly reason: string
}

// Frees the slot of an encomenda or reservation that will not happen.
export class CancelScheduleBookingUseCase {
  constructor(private readonly scheduling: SchedulingModule['useCases']) {}

  async execute(params: CancelScheduleBookingParams): Promise<void> {
    await this.scheduling.cancelBooking.execute({
      companyId: params.establishmentId,
      id: params.bookingId,
      input: { cancelledBy: params.cancelledBy, cancellationReason: params.reason },
    })
  }
}
