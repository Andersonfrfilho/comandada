import type { Router } from '@/infra/http/router'
import { authenticate } from '@/infra/http/middlewares'
import type { UploadController } from './UploadController'

export function registerUploadRoutes(router: Router, controller: UploadController): void {
  router.post('/uploads', authenticate, controller.upload)
}
