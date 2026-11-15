import type { BotMessageProvider } from '@/shared/providers/BotMessageProvider'
import { isWindowExpired } from '@/modules/conversations/application/services/OrderUpdateSender'
import { toLocalDate, toLocalTime } from '@/modules/agenda/shared/agendaTime'
import type { ReminderRepository } from '../ReminderRepository'
import { firstNameOf } from '../reminderText'
import { RESERVATION_REMINDER_MIN_AGE_MINUTES, RESERVATION_REMINDER_TEMPLATE } from '../../shared/reminders.constant'

export interface ReservationReminderDue {
  readonly companyId: string
  readonly bookingId: string
}

type Logger = Pick<Console, 'info' | 'warn'>

/** "hoje às 20:00", "amanhã às 20:00" ou "em 21/11 às 20:00", no fuso do restaurante. */
export function describeWhen(startsAt: Date, now: Date): string {
  const time = toLocalTime(startsAt)
  const day = toLocalDate(startsAt)
  if (day === toLocalDate(now)) return `hoje às ${time}`
  if (day === toLocalDate(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return `amanhã às ${time}`
  const [, month, dayOfMonth] = day.split('-')
  return `em ${dayOfMonth}/${month} às ${time}`
}

/**
 * Lembrete de reserva de mesa (antigo workflow 05, que lia `reservations.customer_phone`). A agenda
 * escolhe o que está devido e chama `handle` uma vez por reserva; erro aqui devolve a reserva para a
 * próxima varredura. Encomendas também passam pela agenda e são ignoradas.
 */
export class ReservationReminderService {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly messages: BotMessageProvider,
    private readonly clock: () => Date = () => new Date(),
    private readonly logger: Logger = console
  ) {}

  async handle(event: ReservationReminderDue): Promise<'sent' | 'skipped'> {
    const reservation = await this.repository.findReservationByBooking({
      establishmentId: event.companyId,
      bookingId: event.bookingId,
    })
    if (!reservation) return 'skipped'

    const now = this.clock()
    // Quem reservou agora há pouco acabou de ler a confirmação.
    if (now.getTime() - reservation.createdAt.getTime() < RESERVATION_REMINDER_MIN_AGE_MINUTES * 60 * 1000) {
      return 'skipped'
    }

    const firstName = firstNameOf(reservation.customerName, reservation.whatsappNumber)
    const when = describeWhen(reservation.startsAt, now)
    const people = `${reservation.partySize} ${reservation.partySize === 1 ? 'pessoa' : 'pessoas'}`
    const body =
      `⏰ *Lembrete da sua reserva*\n\n` +
      `Oi${firstName ? `, *${firstName}*` : ''}! Sua mesa para *${people}* está reservada para *${when}* ` +
      `(reserva ${reservation.code}).\n\n` +
      `Se não puder vir, é só responder esta mensagem que a gente libera a mesa. 🧡`
    try {
      await this.messages.sendText({
        establishmentId: event.companyId,
        whatsappNumber: reservation.whatsappNumber,
        body,
        outsideWindow: {
          template: RESERVATION_REMINDER_TEMPLATE,
          parameters: [firstName || 'cliente', reservation.code, String(reservation.partySize), when],
        },
      })
      return 'sent'
    } catch (error) {
      // Sem template nas Configurações não há como falar fora da janela; tentar de novo não muda isso.
      if (isWindowExpired(error)) {
        this.logger.warn(`[lembretes] reserva ${reservation.code}: fora da janela de 24 h e sem template`)
        return 'skipped'
      }
      throw error
    }
  }
}
