import type { Router } from '@/infra/http/router'
import type { RoleController } from './RoleController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerRoleRoutes(router: Router, controller: RoleController) {
  router.get('/roles', authenticate, authorize('users', 'manage'), controller.list)
  router.get('/roles/:id', authenticate, authorize('users', 'manage'), controller.get)
  router.post('/roles', authenticate, authorize('users', 'manage'), controller.create)
  router.put('/roles/:id', authenticate, authorize('users', 'manage'), controller.update)
  router.delete('/roles/:id', authenticate, authorize('users', 'manage'), controller.delete)
  router.put(
    '/roles/:id/permissions',
    authenticate,
    authorize('users', 'manage'),
    controller.assignPermissions
  )
}
