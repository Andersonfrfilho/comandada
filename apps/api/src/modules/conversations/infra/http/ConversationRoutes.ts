import type { Router } from '@/infra/http/router'
import { authenticate, authorize, internalAuth } from '@/infra/http/middlewares'
import type { ConversationController } from './ConversationController'

export function registerConversationRoutes(router: Router, controller: ConversationController): void {
  router.get('/conversations', authenticate, authorize('conversations', 'read'), controller.list)
  router.post('/conversations/read-all', authenticate, authorize('conversations', 'write'), controller.markAllRead)
  router.get('/conversations/media/:mediaId', authenticate, authorize('conversations', 'read'), controller.fetchMedia)

  // Antes de `/conversations/:whatsapp/...`: "documents" casaria com o parâmetro de número.
  router.get('/conversations/documents', authenticate, authorize('conversations', 'read'), controller.companyDocuments)
  router.get('/conversations/documents/:uploadId/url', authenticate, authorize('conversations', 'read'), controller.documentUrl)
  router.get('/conversations/:whatsapp/documents', authenticate, authorize('conversations', 'read'), controller.documents)

  router.get('/conversations/:whatsapp/messages', authenticate, authorize('conversations', 'read'), controller.history)
  router.get('/conversations/:whatsapp/context', authenticate, authorize('conversations', 'read'), controller.context)
  router.get('/conversations/:whatsapp/export', authenticate, authorize('conversations', 'read'), controller.export)

  router.post('/conversations/:whatsapp/send', authenticate, authorize('conversations', 'write'), controller.send)
  router.post('/conversations/:whatsapp/send-media', authenticate, authorize('conversations', 'write'), controller.sendMedia)
  router.post('/conversations/:whatsapp/send-template', authenticate, authorize('conversations', 'write'), controller.sendTemplate)

  router.post('/conversations/:whatsapp/takeover', authenticate, authorize('conversations', 'write'), controller.takeover)
  router.post('/conversations/:whatsapp/release', authenticate, authorize('conversations', 'write'), controller.release)
  router.post('/conversations/:whatsapp/finalize', authenticate, authorize('conversations', 'write'), controller.release)
  router.post('/conversations/:whatsapp/read', authenticate, authorize('conversations', 'write'), controller.markRead)

  // Internal — called by n8n, protected by shared-secret header instead of user JWT
  router.post('/conversations/:whatsapp/messages', internalAuth, controller.logMessage)
  router.post('/conversations/:whatsapp/request-human', internalAuth, controller.requestHuman)
}
