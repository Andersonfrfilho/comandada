import type { Router } from '@/infra/http/router'
import { authenticate, authorize, internalAuth } from '@/infra/http/middlewares'
import type { FiscalController } from './FiscalController'

export function registerFiscalRoutes(router: Router, controller: FiscalController): void {
  // Public (no auth) — customer views their note via a signed link token
  router.get('/public/fiscal/:token', controller.getPublicByToken)
  router.get('/public/fiscal/:token/xml', controller.getPublicXml)

  // Emit fiscal document for an order
  router.post(
    '/orders/:orderId/fiscal-document',
    authenticate,
    authorize('fiscal', 'write'),
    controller.emit
  )

  // Get fiscal document by order
  router.get(
    '/orders/:orderId/fiscal-document',
    authenticate,
    authorize('fiscal', 'read'),
    controller.getByOrder
  )

  // List all fiscal documents
  router.get(
    '/fiscal-documents',
    authenticate,
    authorize('fiscal', 'read'),
    controller.list
  )

  // Print fiscal cupom (thermal printer)
  router.post(
    '/orders/:orderId/fiscal-document/print',
    authenticate,
    authorize('fiscal', 'write'),
    controller.printCupom
  )

  // Cancel fiscal document
  router.post(
    '/fiscal-documents/:id/cancel',
    authenticate,
    authorize('fiscal', 'write'),
    controller.cancel
  )

  // Download XML
  router.get(
    '/fiscal-documents/:id/xml',
    authenticate,
    authorize('fiscal', 'read'),
    controller.downloadXml
  )

  // Download PDF (generated on-demand from xmlAutorizado)
  router.get(
    '/fiscal-documents/:id/pdf',
    authenticate,
    authorize('fiscal', 'read'),
    controller.downloadPdf
  )

  // Get fiscal config
  router.get(
    '/fiscal-config',
    authenticate,
    authorize('settings', 'read'),
    controller.getConfig
  )

  // Upsert fiscal config
  router.put(
    '/fiscal-config',
    authenticate,
    authorize('settings', 'write'),
    controller.upsertConfig
  )

  // Test fiscal connection
  router.post(
    '/fiscal-config/test',
    authenticate,
    authorize('settings', 'write'),
    controller.testConnection
  )

  // Retry a rejected document
  router.post(
    '/fiscal-documents/:id/retry',
    authenticate,
    authorize('fiscal', 'write'),
    controller.retry
  )

  // Retry all pending documents (called by n8n cron — internal only)
  router.post(
    '/fiscal-documents/retry-pending',
    internalAuth,
    controller.retryPending
  )
}
