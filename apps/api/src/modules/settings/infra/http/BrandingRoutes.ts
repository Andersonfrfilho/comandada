import type { Router } from '@/infra/http/router'
import { authenticate } from '@/infra/http/middlewares'
import type { BrandingController } from './BrandingController'

export function registerBrandingRoutes(router: Router, controller: BrandingController): void {
  router.get('/public/branding', controller.getPublic)
  router.get('/branding', authenticate, controller.getMine)
}
