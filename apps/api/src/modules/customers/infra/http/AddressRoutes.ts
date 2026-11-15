import type { Router } from '@/infra/http/router'
import type { AddressController } from './AddressController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerAddressRoutes(router: Router, controller: AddressController) {
  router.get('/customers/:customerId/addresses', authenticate, authorize('customers', 'read'), controller.list)
  router.post('/customers/:customerId/addresses', authenticate, authorize('customers', 'write'), controller.create)
  router.put('/customers/:customerId/addresses/:addressId', authenticate, authorize('customers', 'write'), controller.update)
  router.delete('/customers/:customerId/addresses/:addressId', authenticate, authorize('customers', 'write'), controller.delete)
  router.put('/customers/:customerId/addresses/:addressId/default', authenticate, authorize('customers', 'write'), controller.setDefault)
  router.get('/addresses/cep/:cep', authenticate, authorize('orders', 'read'), controller.lookupCep)
}
