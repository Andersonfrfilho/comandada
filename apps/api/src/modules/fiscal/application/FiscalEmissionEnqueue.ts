import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalDocument } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { ConflictError } from '@/shared/errors/AppError'
import { fiscalQueue } from '@/infra/queue/fiscalQueue'
import { FISCAL_JOB } from '@/infra/queue/QueueNames.constant'

type Database = NodePgDatabase<typeof schema>

type CreateAndEnqueueParams = {
  readonly database: Database
  readonly websocketHub: WebSocketHub
  readonly establishmentId: string
  readonly orderId: string
  readonly model: FiscalDocument['model']
  readonly totalAmount: string
}

// Single place that creates the `pending` fiscal document, notifies the panel and enqueues the
// emission job. Shared by the manual emit path and the automatic trigger so both stay in sync.
export async function createAndEnqueueFiscalDocument(params: CreateAndEnqueueParams): Promise<FiscalDocument> {
  const { database, websocketHub, establishmentId, orderId, model, totalAmount } = params

  const [document] = await database
    .insert(schema.fiscalDocuments)
    .values({
      establishmentId,
      orderId,
      model,
      status: 'pending',
      totalBruto: totalAmount,
      totalLiquido: totalAmount,
      totalDesconto: '0',
      attemptCount: 0,
    })
    .returning()

  if (!document) throw new ConflictError('Failed to create fiscal document')

  await websocketHub.publishBroadcast(establishmentId, WS_EVENTS.FISCAL_EMITTING, {
    fiscalDocumentId: document.id,
    orderId,
  })

  await fiscalQueue.add(FISCAL_JOB.EMIT, { fiscalDocumentId: document.id, establishmentId })

  return document
}
