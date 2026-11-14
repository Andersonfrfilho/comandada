import { readFileSync, existsSync } from 'fs'
import { extname, join } from 'path'
import { Router, buildCorsAndSecurityHeaders, isAllowedOrigin } from './router'
import { WebSocketHub, type WsClientData } from '@/infra/websocket/WebSocketHub'
import { buildContainer } from '@/infra/container'
import { checkDatabaseConnection, db, runMigrations } from '@/infra/database/connection'
import { startSyncModule } from '@/modules/sync'
import { checkRedisConnection } from '@/infra/redis/connection'
import { RedisProvider } from '@/infra/redis/RedisProvider'
import { registerAuthRoutes } from '@/modules/auth/infra/http/AuthRoutes'
import { registerOrderRoutes } from '@/modules/orders/infra/http/OrderRoutes'
import { registerKitchenRoutes } from '@/modules/kitchen/infra/http/KitchenRoutes'
import { registerDeliveryRoutes } from '@/modules/delivery/infra/http/DeliveryRoutes'
import { registerCashierRoutes } from '@/modules/cashier/infra/http/CashierRoutes'
import { registerDashboardRoutes } from '@/modules/dashboard/infra/http/DashboardRoutes'
import { registerReportsRoutes } from '@/modules/reports/infra/http/ReportsRoutes'
import { registerSettingsRoutes } from '@/modules/settings/infra/http/SettingsRoutes'
import { registerBrandingRoutes } from '@/modules/settings/infra/http/BrandingRoutes'
import { registerDeliveryFeeRoutes } from '@/modules/settings/infra/http/DeliveryFeeRoutes'
import { registerWebhookRoutes } from '@/modules/webhook/infra/http/WebhookRoutes'
import { registerPreviewInboundRoutes } from '@/modules/webhook/infra/http/PreviewInboundRoutes'
import { registerCustomerRoutes } from '@/modules/customers/infra/http/CustomerRoutes'
import { registerAddressRoutes } from '@/modules/customers/infra/http/AddressRoutes'
import { registerTableRoutes } from '@/modules/tables/infra/http/TableRoutes'
import { registerMenuRoutes } from '@/modules/products/infra/http/MenuRoutes'
import { registerStaffRoutes } from '@/modules/users/infra/http/StaffRoutes'
import { registerRoleRoutes } from '@/modules/users/infra/http/RoleRoutes'
import { registerCatalogRoutes } from '@/modules/products/infra/http/CatalogRoutes'
import { registerSectionRoutes } from '@/modules/products/infra/http/SectionRoutes'
import { registerIngredientRoutes } from '@/modules/products/infra/http/IngredientRoutes'
import { registerStockBatchRoutes } from '@/modules/products/infra/http/StockBatchRoutes'
import { registerStockMovementRoutes } from '@/modules/products/infra/http/StockMovementRoutes'
import { registerConversationRoutes } from '@/modules/conversations/infra/http/ConversationRoutes'
import { registerWhatsAppSettingsRoutes } from '@/modules/conversations/infra/http/WhatsAppSettingsRoutes'
import { registerFiscalRoutes } from '@/modules/fiscal/infra/http/FiscalRoutes'
import { registerMonthlyAccountRoutes } from '@/modules/finance/infra/http/MonthlyAccountRoutes'
import { registerExpenseRoutes } from '@/modules/finance/infra/http/ExpenseRoutes'
import { registerUploadRoutes } from '@/modules/uploads/infra/http/UploadRoutes'
import { registerBotRoutes } from '@/modules/bot/infra/http/BotRoutes'
import { registerPaymentRoutes } from '@/modules/payments/infra/http/PaymentRoutes'
import { STALE_CHARGE_SWEEP_INTERVAL_MS } from '@/modules/payments/shared/payments.constant'
import { registerOrderIssueRoutes } from '@/modules/issues/infra/http/OrderIssueRoutes'
import { registerAgendaRoutes } from '@/modules/agenda/infra/http/AgendaRoutes'
import { LocalStorageProvider } from '@/shared/providers/LocalStorageProvider'
import { generateOpenAPISpec } from '@/infra/docs/openapi'
import { startQueueWorkers } from '@/infra/queue/startQueueWorkers'

const PORT = parseInt(process.env.PORT ?? '3333')
const NODE_ENV = process.env.NODE_ENV ?? 'development'

const SCALAR_TEMPLATE = readFileSync(join(__dirname, '../docs/scalar.html'), 'utf-8')

function renderDocs(): string {
  const spec = generateOpenAPISpec()
  return SCALAR_TEMPLATE.replace('__OPENAPI_SPEC__', JSON.stringify(spec))
}

export async function createServer() {
  await checkDatabaseConnection()
  await runMigrations()
  await checkRedisConnection()

  const router = new Router()
  const wsHub = new WebSocketHub(new RedisProvider())
  const container = buildContainer(wsHub)
  // Sincronização loja <-> nuvem (só com SYNC_ROLE). Depois das migrations: precisa das tabelas do SDK.
  // Status mudado na loja (inclusive offline) chega aqui e o cliente é avisado pela nuvem, que tem o WhatsApp.
  const syncModule = await startSyncModule(router, db.$client, {
    onRemoteChanges: async (changes) => {
      await container.notifySyncedOrderStatus.execute(changes)
    },
  })

  // Link de cartão vencido não gera webhook: a varredura cancela o pedido que ficou sem pagar.
  const chargeSweep = setInterval(() => {
    container.expireStaleCharges
      .execute({ now: new Date() })
      .catch((error: unknown) => console.error('[Payments] sweep failed:', error instanceof Error ? error.message : error))
  }, STALE_CHARGE_SWEEP_INTERVAL_MS)
  chargeSweep.unref?.()

  // Filas: no processo da API só o que o ambiente pedir; o lugar delas é o serviço worker.
  const queueWorkers = startQueueWorkers(container.queueWorkerDependencies, 'api')

  // Graceful shutdown: drain workers before exiting
  const shutdownWorkers = async (): Promise<void> => {
    await syncModule.stop()
    await Promise.all(queueWorkers.map((worker) => worker.close()))
    process.exit(0)
  }

  if (process.env.SYNC_ROLE || queueWorkers.length > 0) {
    process.on('SIGTERM', shutdownWorkers)
    process.on('SIGINT', shutdownWorkers)
  }

  // Health check
  router.get('/health', async (_request, response) => {
    response.json({ status: 'ok', timestamp: new Date().toISOString(), env: NODE_ENV })
  })

  router.raw('GET', '/api/openapi.json', () =>
    new Response(JSON.stringify(generateOpenAPISpec()), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    })
  )

  // Scalar API docs (HTML) — spec injetado inline (zero fetch)
  router.raw('GET', '/docs', () =>
    new Response(renderDocs(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  )

  // Register all module routes
  registerAuthRoutes(router, container.authController)
  registerOrderRoutes(router, container.orderController, container.orderReferenceDataController)
  registerKitchenRoutes(router, container.kitchenController)
  registerDeliveryRoutes(router, container.deliveryController)
  registerCashierRoutes(router, container.cashierController)
  registerDashboardRoutes(router, container.dashboardController)
  registerReportsRoutes(router, container.reportsController)
  registerSettingsRoutes(router, container.settingsController)
  registerBrandingRoutes(router, container.brandingController)
  registerDeliveryFeeRoutes(router, container.deliveryFeeController)
  registerWebhookRoutes(router, container.webhookController, container.whatsAppInboundController)
  // Antes de `registerConversationRoutes`: "preview" casaria com `/conversations/:whatsapp`.
  registerPreviewInboundRoutes(router, container.previewInboundController, container.previewMediaController)
  registerCustomerRoutes(router, container.customerController)
  registerAddressRoutes(router, container.addressController)
  registerTableRoutes(router, container.tableController)
  registerMenuRoutes(router, container.menuController)
  registerStaffRoutes(router, container.staffController)
  registerRoleRoutes(router, container.roleController)
  registerCatalogRoutes(router, container.catalogController)
  registerSectionRoutes(router, container.sectionController)
  registerIngredientRoutes(router, container.ingredientController)
  registerStockBatchRoutes(router, container.stockBatchController)
  registerStockMovementRoutes(router, container.stockMovementController)
  registerConversationRoutes(router, container.conversationController)
  registerWhatsAppSettingsRoutes(router, container.whatsAppSettingsController)
  registerFiscalRoutes(router, container.fiscalController)
  registerMonthlyAccountRoutes(router, container.monthlyAccountController)
  registerExpenseRoutes(router, container.expenseController)
  registerUploadRoutes(router, container.uploadController)
  registerBotRoutes(router, container.botController)
  registerPaymentRoutes(router, container.paymentController)
  registerOrderIssueRoutes(router, container.orderIssueController)
  registerAgendaRoutes(router, container.agendaController)

  // Serve uploaded files (public)
  const storageProvider = new LocalStorageProvider()
  const CACHEABLE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.ico', '.css', '.js', '.woff2'])

  const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
  }

  router.raw('GET', '/uploads/:key', (_request, params) => {
    const key = params['key'] ?? ''
    const filePath = storageProvider.getFilePath(key)
    if (!key || !existsSync(filePath)) return new Response('File not found', { status: 404 })

    const extension = extname(key).toLowerCase()
    const headers = new Headers({ 'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream' })
    if (CACHEABLE_EXTENSIONS.has(extension)) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    }
    return new Response(readFileSync(filePath), { headers })
  })

  return {
    listen() {
      Bun.serve<WsClientData>({
        port: PORT,
        websocket: wsHub.handler,
        async fetch(request, server) {
          const origin = request.headers.get('origin') ?? ''
          const { pathname } = new URL(request.url)

          if (pathname === '/ws') {
            if (server.upgrade(request, { data: { authenticated: false } })) return undefined
            return new Response('WebSocket upgrade required', { status: 426 })
          }

          if (request.method === 'OPTIONS') return buildPreflightResponse(origin)

          const response = await router.dispatch(request)
          if (response) return response

          // JSON 404 with CORS, so the browser can tell a missing route from an API that is down.
          const headers = buildCorsAndSecurityHeaders(origin)
          headers.set('Content-Type', 'application/json')
          return new Response(JSON.stringify({ error: 'not_found', message: 'Route not found' }), {
            status: 404,
            headers,
          })
        },
      })
      console.log(`[API] Listening on port ${PORT} [${NODE_ENV}]`)
    },
  }
}

function buildPreflightResponse(origin: string): Response {
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 })
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}
