import type { Router } from '@/infra/http/router'
import type { StockBatchController } from './StockBatchController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerStockBatchRoutes(router: Router, controller: StockBatchController) {
  const read = [authenticate, authorize('products', 'read')]
  const write = [authenticate, authorize('products', 'write')]

  router.get('/stock-batches', ...read, controller.listByIngredient)
  router.get('/stock-batches/expiring', ...read, controller.listExpiring)
  router.get('/stock-batches/expiring/count', ...read, controller.countExpiring)
  router.post('/stock-batches', ...write, controller.create)
}
