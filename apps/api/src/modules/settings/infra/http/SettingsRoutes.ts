import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { SettingsController } from './SettingsController'

export function registerSettingsRoutes(router: Router, controller: SettingsController): void {
  router.get('/settings', authenticate, authorize('settings', 'read'), controller.get)
  router.put('/settings', authenticate, authorize('settings', 'manage'), controller.upsert)
}
