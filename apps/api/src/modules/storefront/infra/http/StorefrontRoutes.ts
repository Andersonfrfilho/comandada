import type { Router } from '@/infra/http/router'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import { STOREFRONT_RATE_LIMITS } from '../../shared/storefront.constant'
import { storefrontRateLimit, type StorefrontController } from './StorefrontController'

export function registerStorefrontRoutes(router: Router, controller: StorefrontController, cache: CacheProvider): void {
  const limit = (options: { keyPrefix: string; windowSeconds: number; maxRequests: number }) => storefrontRateLimit(cache, options)
  router.get('/public/storefront', limit(STOREFRONT_RATE_LIMITS.menu), controller.menu)
  router.get('/public/storefront/orders/:orderId', limit(STOREFRONT_RATE_LIMITS.tracking), controller.orderStatus)
  router.post('/public/storefront/:establishmentId/delivery-quote', limit(STOREFRONT_RATE_LIMITS.quote), controller.quoteDelivery)
  router.post('/public/storefront/:establishmentId/customer', limit(STOREFRONT_RATE_LIMITS.customer), controller.lookupCustomer)
  router.post('/public/storefront/:establishmentId/orders', limit(STOREFRONT_RATE_LIMITS.order), controller.placeOrder)
}
