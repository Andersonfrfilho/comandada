import type { Router } from '@/infra/http/router'
import type { TableController } from './TableController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerTableRoutes(router: Router, controller: TableController) {
  // Tables CRUD (authenticated)
  router.get('/tables', authenticate, authorize('orders', 'read'), controller.list)
  router.post('/tables', authenticate, authorize('orders', 'write'), controller.create)
  router.put('/tables/:id', authenticate, authorize('orders', 'write'), controller.update)
  router.patch('/tables/:id/position', authenticate, authorize('orders', 'write'), controller.updatePosition)
  router.delete('/tables/:id', authenticate, authorize('orders', 'write'), controller.delete)

  // Junção temporária de mesas
  router.post('/tables/group', authenticate, authorize('orders', 'write'), controller.group)
  router.delete('/tables/group/:groupId', authenticate, authorize('orders', 'write'), controller.ungroup)

  // Comanda management (authenticated — waiter/admin)
  router.get('/tables/:id/comandas', authenticate, authorize('orders', 'read'), controller.listComandasByTable)
  router.post('/tables/:id/comanda', authenticate, authorize('orders', 'write'), controller.openComanda)
  router.patch('/comandas/:comandaId/close', authenticate, authorize('orders', 'write'), controller.closeComanda)

  // Public comanda endpoints (no auth — customer facing)
  router.get('/public/comanda/:code', controller.getComandaByCode)
  router.post('/public/comanda/:code/confirm', controller.confirmComanda)
}
