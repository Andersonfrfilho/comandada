import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { ExpenseController } from './ExpenseController'

export function registerExpenseRoutes(router: Router, controller: ExpenseController): void {
  router.get('/expenses', authenticate, authorize('finance', 'read'), controller.list)
  router.post('/expenses', authenticate, authorize('finance', 'write'), controller.create)
  router.put('/expenses/:id', authenticate, authorize('finance', 'write'), controller.update)
  router.delete('/expenses/:id', authenticate, authorize('finance', 'delete'), controller.delete)
  router.post('/expenses/:id/receipt', authenticate, authorize('finance', 'write'), controller.uploadReceipt)
  router.get('/finance/overview', authenticate, authorize('finance', 'read'), controller.getOverview)
}
