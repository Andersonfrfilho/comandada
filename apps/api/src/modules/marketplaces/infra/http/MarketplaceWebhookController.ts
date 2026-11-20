import type { RouteHandler } from '@/infra/http/router'
import { isMarketplacePlatform } from '../../domain/Marketplace'
import type { MarketplaceOrderService } from '../../application/MarketplaceOrderService'

/**
 * Webhook das plataformas (alternativa ao polling). A assinatura é a autenticação: sem ela, 401.
 * Plataforma desligada responde 404, como se a rota não existisse.
 */
export class MarketplaceWebhookController {
  constructor(private readonly service: MarketplaceOrderService) {}

  receive: RouteHandler = async (request, response) => {
    const platform = request.params['platform'] ?? ''
    const connection = isMarketplacePlatform(platform) ? this.service.connection(platform) : undefined
    if (!isMarketplacePlatform(platform) || !connection) {
      response.error('not_found', 'Unknown marketplace webhook', 404)
      return
    }
    if (!connection.provider.verifyWebhook(request.rawBody, request.headers)) {
      response.error('invalid_signature', 'Invalid marketplace signature', 401)
      return
    }
    const events = connection.provider.parseWebhook(request.body)
    // Evento que falhou fica sem registro e chega de novo pelo polling.
    await this.service.handleEvents(platform, events)
    response.json({ received: events.length }, 202)
  }
}
