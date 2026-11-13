import type { Router } from '@/infra/http/router'
import { internalAuth } from '@/infra/http/middlewares'
import type { BotController } from './BotController'

export function registerBotRoutes(router: Router, controller: BotController): void {
  router.get('/internal/bot/:whatsapp/context', internalAuth, controller.context)
  router.put('/internal/bot/:whatsapp/session', internalAuth, controller.saveSession)
  router.post('/internal/bot/:whatsapp/orders', internalAuth, controller.createOrder)
  router.post('/internal/bot/:whatsapp/reservations', internalAuth, controller.createReservation)
  router.post('/internal/bot/:whatsapp/issues', internalAuth, controller.createIssue)
  router.post('/internal/bot/:whatsapp/partial-confirmation', internalAuth, controller.answerPartialConfirmation)
  router.put('/internal/bot/:whatsapp/customer', internalAuth, controller.updateCustomer)
}
