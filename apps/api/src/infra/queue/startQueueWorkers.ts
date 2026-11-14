/**
 * Quem consome as filas BullMQ. Duas formas de rodar:
 *
 * - `worker` (src/worker.ts, serviço próprio no Railway): é o padrão. O bot do WhatsApp sobe
 *   sempre; as demais filas seguem as mesmas variáveis de antes.
 * - `api` (src/index.ts): compatível com o que existia. Cada fila sobe com a sua variável, e
 *   `API_QUEUE_WORKERS=false` desliga todas — é o que se põe na API quando o worker existe.
 *   A fila do WhatsApp só roda na API com `WHATSAPP_INBOUND_WORKER_ENABLED=true` (dev sem worker).
 *
 * Rodar a mesma fila nos dois lugares não duplica job (BullMQ entrega cada job a um consumidor),
 * mas o worker é o lugar certo: deploy da API não interrompe processamento.
 */

import type { Worker } from 'bullmq'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import type { BotMessageProvider } from '@/shared/providers/BotMessageProvider'
import type { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import type { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import type { MetaWhatsAppModuleRegistry } from '@/modules/conversations/infra/whatsapp/metaWhatsAppModule'
import { startDocumentIngestionWorker } from '@/modules/conversations/application/workers/DocumentIngestionWorker'
import { startFiscalWorker } from '@/modules/fiscal/application/workers/FiscalEmissionProcessor'
import { startFinanceWorker } from '@/modules/finance/application/workers/AccountDueWorker'
import { startIfoodWorker } from '@/modules/orders/application/workers/IfoodPollingWorker'
import { startProductAffinityWorker } from '@/modules/products/application/workers/ProductAffinityWorker'
import { startStockWorker } from '@/modules/products/application/workers/StockExpiryWorker'
import { startWhatsAppInboundWorker } from '@/modules/webhook/application/workers/WhatsAppInboundWorker'
import { startBullBoard } from './bullBoard'
import { planQueueWorkers, type QueueWorkerRuntime } from './queueWorkerPlan'

export type { QueueWorkerRuntime } from './queueWorkerPlan'

export interface QueueWorkerDependencies {
  database: NodePgDatabase<typeof schema>
  websocketHub: WebSocketHub
  botMessages: BotMessageProvider
  createOrderUseCase: CreateOrderUseCase
  updateOrderStatusUseCase: UpdateOrderStatusUseCase
  metaWhatsAppModules: MetaWhatsAppModuleRegistry
  documentIngestionEnabled: boolean
}

type Environment = Record<string, string | undefined>

export function startQueueWorkers(
  dependencies: QueueWorkerDependencies,
  runtime: QueueWorkerRuntime,
  environment: Environment = process.env
): Worker[] {
  const plan = planQueueWorkers(runtime, environment, dependencies.documentIngestionEnabled)
  const label = runtime === 'api' ? '[API]' : '[Worker]'
  const workers: Worker[] = []

  const start = (enabled: boolean, name: string, factory: () => Worker): void => {
    if (!enabled) return
    workers.push(factory())
    console.log(`${label} ${name} worker started`)
  }

  start(plan.whatsAppInbound, 'WhatsApp inbound', () => startWhatsAppInboundWorker() as unknown as Worker)
  start(plan.fiscal, 'Fiscal', () =>
    startFiscalWorker({
      database: dependencies.database,
      websocketHub: dependencies.websocketHub,
      botMessages: dependencies.botMessages,
    })
  )
  start(plan.finance, 'Finance', () => startFinanceWorker(dependencies.database))
  start(plan.ifood, 'iFood polling', () =>
    startIfoodWorker(
      dependencies.database,
      dependencies.createOrderUseCase,
      dependencies.updateOrderStatusUseCase
    )
  )
  start(plan.productAffinity, 'Product affinity', () => startProductAffinityWorker(dependencies.database))
  start(plan.stock, 'Stock expiry', () => startStockWorker(dependencies.database))
  start(plan.documentIngestion, 'Document ingestion', () =>
    startDocumentIngestionWorker({ modules: dependencies.metaWhatsAppModules })
  )

  if (workers.length > 0) startBullBoard()

  return workers
}
