import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { MarketplaceWebhookController } from './MarketplaceWebhookController'
import type { MarketplacePanelController } from './MarketplacePanelController'

export function registerMarketplaceRoutes(
  router: Router,
  controller: MarketplaceWebhookController,
  panel?: MarketplacePanelController
): void {
  // iFood: /webhooks/marketplaces/ifood · 99Food: /webhooks/marketplaces/99food
  router.post('/webhooks/marketplaces/:platform', controller.receive)
  if (!panel) return

  // Só diz quais plataformas estão ligadas (as telas escondem o que não existe): basta estar logado.
  router.get('/marketplaces', authenticate, panel.overview)
  // Pedido da plataforma: status lá, negociações e cancelamento com o motivo que a plataforma aceita.
  router.get('/marketplaces/orders/:orderId', authenticate, authorize('orders', 'read'), panel.order)
  router.get('/marketplaces/orders/:orderId/cancellation-reasons', authenticate, authorize('orders', 'write'), panel.cancellationReasons)
  router.post('/marketplaces/orders/:orderId/cancel', authenticate, authorize('orders', 'write'), panel.cancel)
  router.get('/marketplaces/disputes', authenticate, authorize('orders', 'read'), panel.disputes)
  router.post('/marketplaces/disputes/:id/respond', authenticate, authorize('orders', 'write'), panel.respondDispute)
  // Financeiro: vendas com taxas e repasses de cada plataforma.
  router.get('/marketplaces/financial/sales', authenticate, authorize('finance', 'read'), panel.sales)
  router.get('/marketplaces/financial/settlements', authenticate, authorize('finance', 'read'), panel.settlements)
  // Avaliações (iFood): ler é de quem vê relatórios; responder fica público na loja, então é do gerente.
  router.get('/marketplaces/reviews', authenticate, authorize('reports', 'read'), panel.reviews)
  router.get('/marketplaces/reviews/summary', authenticate, authorize('reports', 'read'), panel.reviewSummary)
  router.post('/marketplaces/reviews/:id/answers', authenticate, authorize('reports', 'write'), panel.answerReview)
}
