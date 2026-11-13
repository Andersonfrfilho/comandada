import { ResourceUnavailableError, SlotUnavailableError } from '@adatechnology/scheduling-contracts'
import type { SchedulingModule } from '@adatechnology/scheduling-module'

export interface BookFirstFreeResourceParams {
  readonly scheduling: SchedulingModule['useCases']
  readonly companyId: string
  readonly serviceId: string
  readonly resourceIds: readonly string[]
  readonly startsAt: Date
  readonly durationMinutes: number
  readonly title: string
  readonly customerRef?: string | undefined
}

export interface BookFirstFreeResourceResult {
  readonly bookingId: string
  readonly resourceId: string
}

// The EXCLUDE constraint decides who wins a slot; trying resources in order is how capacity is used.
export async function bookFirstFreeResource(
  params: BookFirstFreeResourceParams
): Promise<BookFirstFreeResourceResult | undefined> {
  const during = { start: params.startsAt, end: new Date(params.startsAt.getTime() + params.durationMinutes * 60_000) }
  for (const resourceId of params.resourceIds) {
    try {
      const { booking } = await params.scheduling.requestBooking.execute({
        companyId: params.companyId,
        input: {
          title: params.title,
          serviceId: params.serviceId,
          during,
          resourceIds: [resourceId],
          ...(params.customerRef ? { customerRef: params.customerRef } : {}),
        },
      })
      if (booking.status === 'requested') {
        await params.scheduling.confirmBooking.execute({ companyId: params.companyId, id: booking.id })
      }
      return { bookingId: booking.id, resourceId }
    } catch (error) {
      const isTaken = error instanceof SlotUnavailableError || error instanceof ResourceUnavailableError
      if (!isTaken) throw error
    }
  }
  return undefined
}
