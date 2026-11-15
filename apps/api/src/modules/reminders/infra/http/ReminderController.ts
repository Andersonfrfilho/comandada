import type { RouteHandler } from '@/infra/http/router'
import type { SendReorderRemindersUseCase } from '../../application/use-cases/SendReorderRemindersUseCase'

interface ReservationReminderSweep {
  execute(params?: { limit?: number }): Promise<{ processed: number }>
}

// Chamado pelos crons do n8n (workflows 04 e 05), atrás do token interno.
export class ReminderController {
  constructor(
    private readonly reorderReminders: SendReorderRemindersUseCase,
    private readonly reservationReminders: ReservationReminderSweep
  ) {}

  reorder: RouteHandler = async (_request, response) => {
    response.json(await this.reorderReminders.execute())
  }

  reservations: RouteHandler = async (_request, response) => {
    response.json(await this.reservationReminders.execute())
  }
}
