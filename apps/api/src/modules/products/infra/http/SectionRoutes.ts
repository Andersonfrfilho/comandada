import type { Router } from '@/infra/http/router'
import type { SectionController } from './SectionController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerSectionRoutes(router: Router, controller: SectionController) {
  const read = [authenticate, authorize('products', 'read')]
  const write = [authenticate, authorize('products', 'write')]
  const del = [authenticate, authorize('products', 'delete')]

  router.get('/sections', ...read, controller.list)
  router.post('/sections', ...write, controller.create)
  router.put('/sections/:id', ...write, controller.update)
  router.delete('/sections/:id', ...del, controller.delete)
}
