import type { Router } from '@/infra/http/router'
import type { MarketplaceWebhookController } from './MarketplaceWebhookController'

export function registerMarketplaceRoutes(router: Router, controller: MarketplaceWebhookController): void {
  // iFood: /webhooks/marketplaces/ifood · 99Food: /webhooks/marketplaces/99food
  router.post('/webhooks/marketplaces/:platform', controller.receive)
}
