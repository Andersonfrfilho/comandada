import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { ReportsController } from './ReportsController'

export function registerReportsRoutes(router: Router, controller: ReportsController): void {
  router.get('/reports/orders/export', authenticate, authorize('reports', 'read'), controller.exportOrders)
  router.get('/reports/monthly', authenticate, authorize('reports', 'read'), controller.getMonthlyReport)
  router.get('/reports/funnel', authenticate, authorize('reports', 'read'), controller.getFunnelAnalysis)
  router.get('/reports/table-metrics', authenticate, authorize('reports', 'read'), controller.getTableMetrics)
  router.get('/reports/ingredients-ranking', authenticate, authorize('reports', 'read'), controller.getIngredientsRanking)
  router.get('/reports/product-profit', authenticate, authorize('reports', 'read'), controller.getProductProfit)
  router.get('/reports/preparation-time-comparison', authenticate, authorize('reports', 'read'), controller.getPreparationTimeComparison)
}
