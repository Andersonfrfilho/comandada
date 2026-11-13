import type { Router } from '@/infra/http/router'
import type { WebhookController } from './WebhookController'

// Webhook routes have no auth middleware — they use HMAC verification instead
export function registerWebhookRoutes(router: Router, controller: WebhookController): void {
  // A Meta usa a MESMA URL de callback para o handshake (GET) e para as mensagens (POST).
  // Como o POST leva o establishmentId no caminho, o GET também precisa aceitá-lo.
  router.get('/webhook', controller.verify)
  router.get('/webhook/:establishmentId', controller.verify)
  router.post('/webhook/:establishmentId', controller.receive)
}
