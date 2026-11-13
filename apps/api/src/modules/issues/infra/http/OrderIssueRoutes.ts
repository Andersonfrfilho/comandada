import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { OrderIssueController } from './OrderIssueController'

export function registerOrderIssueRoutes(router: Router, controller: OrderIssueController): void {
  router.get('/reports/order-issues', authenticate, authorize('reports', 'read'), controller.report)
  router.patch('/order-issues/:id/resolve', authenticate, authorize('orders', 'write'), controller.resolve)
}
