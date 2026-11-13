import type { Router } from '@/infra/http/router'
import type { StockMovementController } from './StockMovementController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerStockMovementRoutes(router: Router, controller: StockMovementController) {
  const read = [authenticate, authorize('products', 'read')]
  const write = [authenticate, authorize('products', 'write')]

  router.get('/stock-movements', ...read, controller.listByIngredient)
  router.post('/stock-movements', ...write, controller.create)
}
