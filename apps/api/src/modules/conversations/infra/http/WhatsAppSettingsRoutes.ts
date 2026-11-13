import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { WhatsAppSettingsController } from './WhatsAppSettingsController'

export function registerWhatsAppSettingsRoutes(
  router: Router,
  controller: WhatsAppSettingsController
): void {
  router.get('/whatsapp/settings', authenticate, authorize('settings', 'read'), controller.get)
  router.put('/whatsapp/settings', authenticate, authorize('settings', 'write'), controller.save)

  router.get(
    '/whatsapp/templates',
    authenticate,
    authorize('settings', 'read'),
    controller.listTemplates
  )
  router.post(
    '/whatsapp/templates',
    authenticate,
    authorize('settings', 'write'),
    controller.createTemplate
  )
}
