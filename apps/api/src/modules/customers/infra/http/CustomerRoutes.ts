import type { Router } from '@/infra/http/router'
import type { CustomerController } from './CustomerController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerCustomerRoutes(router: Router, controller: CustomerController) {
  router.get('/customers', authenticate, authorize('customers', 'read'), controller.list)
  router.get('/customers/:id', authenticate, authorize('customers', 'read'), controller.get)
  router.post('/customers', authenticate, authorize('customers', 'write'), controller.create)
  router.put('/customers/:id', authenticate, authorize('customers', 'write'), controller.update)
  router.delete('/customers/:id', authenticate, authorize('customers', 'write'), controller.delete)
}
