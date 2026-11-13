import type { Router } from '@/infra/http/router'
import { authenticate } from '@/infra/http/middlewares'
import type { AuthController } from './AuthController'

export function registerAuthRoutes(router: Router, controller: AuthController): void {
  router.post('/auth/login', controller.login)
  router.post('/auth/refresh', controller.refresh)
  router.post('/auth/logout', controller.logout)
  router.get('/auth/me', authenticate, controller.me)
  router.post('/auth/change-password', authenticate, controller.changePassword)
}
