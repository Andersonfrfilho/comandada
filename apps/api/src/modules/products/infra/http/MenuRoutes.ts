import type { Router } from '@/infra/http/router'
import type { MenuController } from './MenuController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerMenuRoutes(router: Router, controller: MenuController) {
  router.get('/menu', authenticate, authorize('orders', 'read'), controller.getMenu)
}
