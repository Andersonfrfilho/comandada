import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { OrderController } from './OrderController'
import type { OrderReferenceDataController } from './OrderReferenceDataController'

export function registerOrderRoutes(
  router: Router,
  controller: OrderController,
  referenceDataController: OrderReferenceDataController
): void {
  router.get('/payment-types', authenticate, authorize('orders', 'read'), referenceDataController.listPaymentTypes)
  router.get('/order-types', authenticate, authorize('orders', 'read'), referenceDataController.listOrderTypes)
  router.get('/orders', authenticate, authorize('orders', 'read'), controller.list)
  router.post('/orders', authenticate, authorize('orders', 'write'), controller.create)
  router.get('/orders/:id', authenticate, authorize('orders', 'read'), controller.get)
  router.get('/orders/:id/substitutes', authenticate, authorize('orders', 'read'), controller.substitutes)
  router.get('/orders/:id/route', authenticate, authorize('orders', 'read'), controller.route)
  router.patch('/orders/:id/status', authenticate, authorize('orders', 'write'), controller.updateStatus)
  router.patch('/orders/:id/notes', authenticate, authorize('orders', 'write'), controller.updateNotes)
  router.post(
    '/orders/:id/partial-confirmation',
    authenticate,
    authorize('orders', 'write'),
    controller.requestPartialConfirmation
  )
  router.post('/orders/:id/ifood/accept', authenticate, authorize('orders', 'write'), controller.ifoodAccept)
  router.post('/orders/:id/ifood/reject', authenticate, authorize('orders', 'write'), controller.ifoodReject)
}
