import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { CashierController } from './CashierController'

export function registerCashierRoutes(router: Router, controller: CashierController): void {
  router.get('/cashier/registers/current', authenticate, authorize('cashier', 'read'), controller.current)
  router.post('/cashier/registers', authenticate, authorize('cashier', 'write'), controller.open)
  router.patch('/cashier/registers/:id/close', authenticate, authorize('cashier', 'write'), controller.close)
  router.post('/cashier/movements', authenticate, authorize('cashier', 'write'), controller.addMovement)
}
