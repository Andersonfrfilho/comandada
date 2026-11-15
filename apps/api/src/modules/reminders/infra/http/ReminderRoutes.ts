import type { Router } from '@/infra/http/router'
import { internalAuth } from '@/infra/http/middlewares'
import type { ReminderController } from './ReminderController'

export function registerReminderRoutes(router: Router, controller: ReminderController): void {
  router.post('/internal/reminders/reorder', internalAuth, controller.reorder)
  router.post('/internal/reminders/reservations', internalAuth, controller.reservations)
}
