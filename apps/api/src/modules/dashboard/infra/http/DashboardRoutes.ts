import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { DashboardController } from './DashboardController'

export function registerDashboardRoutes(router: Router, controller: DashboardController): void {
  router.get('/dashboard/metrics', authenticate, authorize('reports', 'read'), controller.metrics)
}
