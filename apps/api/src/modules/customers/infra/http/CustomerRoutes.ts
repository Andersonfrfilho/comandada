import type { Router } from '@/infra/http/router'
import type { CustomerController } from './CustomerController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerCustomerRoutes(router: Router, controller: CustomerController) {
  router.get('/customers', authenticate, authorize('orders', 'read'), controller.list)
  router.get('/customers/:id', authenticate, authorize('orders', 'read'), controller.get)
  router.post('/customers', authenticate, authorize('orders', 'write'), controller.create)
  router.put('/customers/:id', authenticate, authorize('orders', 'write'), controller.update)
  router.delete('/customers/:id', authenticate, authorize('orders', 'write'), controller.delete)
}
