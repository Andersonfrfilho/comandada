import type { Router } from '@/infra/http/router'
import type { WebhookController } from './WebhookController'
import type { WhatsAppInboundController } from './WhatsAppInboundController'

// Webhook routes have no auth middleware — they use HMAC verification instead
export function registerWebhookRoutes(
  router: Router,
  controller: WebhookController,
  inboundController: WhatsAppInboundController
): void {
  // A Meta usa a MESMA URL de callback para o handshake (GET) e para as mensagens (POST).
  // Como o POST leva o establishmentId no caminho, o GET também precisa aceitá-lo.
  router.get('/webhook', controller.verify)
  router.get('/webhook/:establishmentId', controller.verify)
  router.post('/webhook/:establishmentId', controller.receive)

  // Entrada do bot: a Meta chama a API, que enfileira; o serviço worker leva ao n8n.
  router.get('/webhooks/whatsapp', controller.verify)
  router.post('/webhooks/whatsapp', inboundController.receive)
}
