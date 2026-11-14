import type { Router } from '@/infra/http/router'
import type { MenuPdfController } from './MenuPdfController'

export function registerMenuPdfRoutes(router: Router, controller: MenuPdfController): void {
  router.get('/public/menu/:establishmentId/cardapio.pdf', controller.getMenuPdf)
}
