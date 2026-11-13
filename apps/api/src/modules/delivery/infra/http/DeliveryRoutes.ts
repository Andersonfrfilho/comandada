import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { DeliveryController } from './DeliveryController'

export function registerDeliveryRoutes(router: Router, controller: DeliveryController): void {
  router.get('/delivery/queue', authenticate, authorize('delivery', 'read'), controller.queue)
  router.patch('/delivery/:id/status', authenticate, authorize('delivery', 'write'), controller.updateStatus)
}
