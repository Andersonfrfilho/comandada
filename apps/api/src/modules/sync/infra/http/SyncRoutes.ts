import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { SyncController } from './SyncController'
import { disabledSyncStatus } from './SyncController'
import { syncAuth } from './syncAuth'

export function registerSyncRoutes(router: Router, controller: SyncController, token: string): void {
  const auth = syncAuth(token)
  router.post('/internal/sync/push', auth, controller.push)
  router.get('/internal/sync/pull', auth, controller.pull)

  router.get('/sync/status', authenticate, controller.status)
  router.get('/sync/conflicts', authenticate, authorize('settings', 'read'), controller.listConflicts)
  router.post('/sync/conflicts/:id/accept', authenticate, authorize('settings', 'write'), controller.acceptConflict)
  router.post('/sync/conflicts/:id/discard', authenticate, authorize('settings', 'write'), controller.discardConflict)
}

export function registerDisabledSyncRoutes(router: Router): void {
  router.get('/sync/status', authenticate, disabledSyncStatus)
}
