import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { KitchenController } from './KitchenController'

export function registerKitchenRoutes(router: Router, controller: KitchenController): void {
  router.get('/kitchen/queue', authenticate, authorize('kitchen', 'read'), controller.queue)
  router.patch('/kitchen/orders/:id/advance', authenticate, authorize('kitchen', 'write'), controller.advance)
  router.patch(
    '/kitchen/orders/:id/items/:itemId/ready',
    authenticate,
    authorize('kitchen', 'write'),
    controller.markItemReady
  )
}
