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
  // App do garçom: pede a conta (o caixa recebe em Mesas).
  router.post('/comandas/:comandaId/request-bill', authenticate, authorize('orders', 'write'), controller.requestBill)
  router.patch('/comandas/:comandaId/transfer', authenticate, authorize('orders', 'write'), controller.transferComanda)
  // Conta da mesa: quem lança pedido e quem cuida do caixa veem; receber é do caixa.
  router.get('/comandas/:comandaId/bill', authenticate, authorize('orders', 'read'), controller.getComandaBill)
  router.post('/comandas/:comandaId/settle', authenticate, authorize('cashier', 'write'), controller.settleComanda)

  // Public comanda endpoints (no auth — customer facing)
  router.get('/public/comanda/:code', controller.getComandaByCode)
  router.post('/public/comanda/:code/confirm', controller.confirmComanda)
}
