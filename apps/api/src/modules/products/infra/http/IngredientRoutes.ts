import type { Router } from '@/infra/http/router'
import type { IngredientController } from './IngredientController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerIngredientRoutes(router: Router, controller: IngredientController) {
  const read = [authenticate, authorize('products', 'read')]
  const write = [authenticate, authorize('products', 'write')]
  const del = [authenticate, authorize('products', 'delete')]

  router.get('/ingredients', ...read, controller.list)
  router.get('/ingredients/low-stock', ...read, controller.listLowStock)
  router.get('/ingredients/low-stock/count', ...read, controller.countLowStock)
  router.post('/ingredients', ...write, controller.create)
  router.put('/ingredients/:id', ...write, controller.update)
  router.delete('/ingredients/:id', ...del, controller.delete)

  router.get('/ingredients/product/:productId', ...read, controller.listByProduct)
  router.post('/ingredients/product/:productId', ...write, controller.addToProduct)
  router.delete('/ingredients/product/:productId/:id', ...del, controller.removeFromProduct)
}
