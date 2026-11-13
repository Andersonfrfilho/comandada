import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { PaymentController } from './PaymentController'

export function registerPaymentRoutes(router: Router, controller: PaymentController): void {
  router.get('/settings/payments', authenticate, authorize('settings', 'read'), controller.getAccount)
  router.put('/settings/payments', authenticate, authorize('settings', 'manage'), controller.upsertAccount)
  // O provedor chama esta URL; a assinatura do webhook é a autenticação.
  router.post('/webhooks/payments/:provider/:establishmentId', controller.webhook)
}
