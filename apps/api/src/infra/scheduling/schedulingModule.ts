import { createSchedulingModule, type SchedulingModule } from '@adatechnology/scheduling-module'
import type { BookingReminderDueEvent } from '@adatechnology/scheduling-contracts'

import { db } from '@/infra/database/connection'

const SCHEDULING_MAX_LOOKAHEAD_DAYS = 30

type BookingReminderHandler = (event: BookingReminderDueEvent) => Promise<unknown>

let bookingReminderHandler: BookingReminderHandler | undefined

/**
 * Quem envia o lembrete de reserva vive no container, que é montado depois deste módulo. Sem handler
 * registrado o hook falha, e a agenda devolve a reserva para a próxima varredura em vez de perdê-la.
 */
export function setBookingReminderHandler(handler: BookingReminderHandler): void {
  bookingReminderHandler = handler
}

// One instance per process: the module holds no connection of its own, it borrows the host's.
export const schedulingModule: SchedulingModule = createSchedulingModule({
  db,
  config: {
    maxLookaheadDays: SCHEDULING_MAX_LOOKAHEAD_DAYS,
    defaultMinCancellationNoticeMinutes: 0,
  },
  hooks: {
    async onBookingReminderDue(event) {
      if (!bookingReminderHandler) throw new Error('booking reminder handler not registered')
      await bookingReminderHandler(event)
    },
  },
})
