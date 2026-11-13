import type { Router } from '@/infra/http/router'
import type { StaffController } from './StaffController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerStaffRoutes(router: Router, controller: StaffController) {
  router.get('/staff', authenticate, authorize('users', 'read'), controller.list)
  router.get('/staff/roles', authenticate, authorize('users', 'read'), controller.listRoles)
  router.post('/staff', authenticate, authorize('users', 'write'), controller.create)
  router.put('/staff/:id', authenticate, authorize('users', 'write'), controller.update)
  router.patch('/staff/:id/toggle-active', authenticate, authorize('users', 'write'), controller.toggleActive)
  router.post('/staff/:id/reset-password', authenticate, authorize('users', 'manage'), controller.resetPassword)
  router.delete('/staff/:id', authenticate, authorize('users', 'delete'), controller.delete)
}
