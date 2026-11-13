import type { Router } from '@/infra/http/router'
import type { CatalogController } from './CatalogController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerCatalogRoutes(router: Router, controller: CatalogController) {
  const read = [authenticate, authorize('products', 'read')]
  const write = [authenticate, authorize('products', 'write')]
  const del = [authenticate, authorize('products', 'delete')]

  router.get('/catalog/catalogs', ...read, controller.listCatalogs)
  router.post('/catalog/catalogs', ...write, controller.createCatalog)
  router.put('/catalog/catalogs/:id', ...write, controller.updateCatalog)
  router.delete('/catalog/catalogs/:id', ...del, controller.deleteCatalog)

  router.get('/catalog/products', ...read, controller.listProducts)
  router.post('/catalog/products', ...write, controller.createProduct)
  router.post('/catalog/products/bulk', ...write, controller.bulkImportProducts)
  router.put('/catalog/products/:id', ...write, controller.updateProduct)
  router.patch('/catalog/products/:id/toggle-active', ...write, controller.toggleProductActive)
  router.delete('/catalog/products/:id', ...del, controller.deleteProduct)
  router.get('/catalog/products/:id/price-history', ...read, controller.getProductPriceHistory)
  router.get('/catalog/products/:id/affinities', ...read, controller.getProductAffinities)
  router.get('/catalog/products/:id/components', ...read, controller.listKitComponents)
  router.put('/catalog/products/:id/components', ...write, controller.setKitComponents)

  router.get('/catalog/product-search', ...read, controller.productSearch)
  router.get('/catalog/product-lookup/:barcode', ...read, controller.productLookup)
  router.get('/catalog/regional-price/:barcode', ...read, controller.regionalPrice)
}
