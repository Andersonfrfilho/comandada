import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { AgendaController } from './AgendaController'

export function registerAgendaRoutes(router: Router, controller: AgendaController): void {
  router.get('/agenda', authenticate, authorize('orders', 'read'), controller.day)
}
