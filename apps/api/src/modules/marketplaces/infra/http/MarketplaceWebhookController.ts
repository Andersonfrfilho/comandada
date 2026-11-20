import type { RouteHandler } from '@/infra/http/router'
import { isMarketplacePlatform } from '../../domain/Marketplace'
import type { MarketplaceOrderService } from '../../application/MarketplaceOrderService'

/**
 * Webhook das plataformas (alternativa ao polling). A assinatura é a autenticação: sem ela, 401.
 * Plataforma desligada responde 404, como se a rota não existisse.
 */
const WEBHOOK_DEADLINE_MS = 5000

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds).unref?.())
}

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
    const events = connection.provider.parseWebhook(request.rawBody, request.body)
    // Plataformas esperam a resposta em poucos segundos. Passou do prazo ou algum evento falhou: responde "tente de
    // novo"; o reenvio de um evento já tratado (ou ainda em andamento) cai no controle de repetidos.
    const handling = this.service.handleEvents(platform, events).then((handled) => handled.length === events.length)
    const ok = await Promise.race([handling, delay(WEBHOOK_DEADLINE_MS).then(() => false)])
    handling.catch((error: unknown) => console.error('[Marketplaces] webhook falhou:', error instanceof Error ? error.message : error))
    const reply = connection.provider.webhookResponse?.(ok) ?? { status: ok ? 202 : 500, body: { received: events.length } }
    response.json(reply.body, reply.status)
  }
}
