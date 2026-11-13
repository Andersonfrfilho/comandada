import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { MonthlyAccountController } from './MonthlyAccountController'

export function registerMonthlyAccountRoutes(router: Router, controller: MonthlyAccountController): void {
  router.get('/monthly-accounts', authenticate, authorize('finance', 'read'), controller.list)
  router.post('/monthly-accounts', authenticate, authorize('finance', 'write'), controller.create)
  router.put('/monthly-accounts/:id', authenticate, authorize('finance', 'write'), controller.update)
  router.delete('/monthly-accounts/:id', authenticate, authorize('finance', 'delete'), controller.delete)
  router.patch('/monthly-accounts/:id/pay', authenticate, authorize('finance', 'write'), controller.markAsPaid)
  router.patch('/monthly-accounts/:id/unpay', authenticate, authorize('finance', 'write'), controller.markAsPending)
}
