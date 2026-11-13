import { eq, and, lt } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalConfiguration } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { fiscalQueue } from '@/infra/queue/fiscalQueue'
import { FISCAL_JOB } from '@/infra/queue/QueueNames.constant'

type Database = NodePgDatabase<typeof schema>

const MAX_RETRY_ATTEMPTS = 5

export class RetryFiscalDocumentUseCase {
  constructor(
    private readonly database: Database,
    private readonly websocketHub: WebSocketHub
  ) {}

  async retrySingle(fiscalDocumentId: string, establishmentId: string): Promise<schema.FiscalDocument> {
    const document = await this.database.query.fiscalDocuments.findFirst({
      where: and(
        eq(schema.fiscalDocuments.id, fiscalDocumentId),
        eq(schema.fiscalDocuments.establishmentId, establishmentId)
      ),
    })
    if (!document) throw new NotFoundError('Fiscal document')

    if (document.status !== 'rejected') {
      throw new UnprocessableError('Only rejected documents can be retried')
    }

    if (document.attemptCount >= MAX_RETRY_ATTEMPTS) {
      throw new UnprocessableError(`Max retry attempts (${MAX_RETRY_ATTEMPTS}) exceeded`)
    }

    const fiscalConfig = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
    })
    if (!fiscalConfig || fiscalConfig.model === 'none' || !fiscalConfig.active) {
      throw new UnprocessableError('Fiscal configuration not active')
    }

    return this.enqueueRetry(document)
  }

  async retryAllPending(): Promise<{ retried: number; failed: number }> {
    const documents = await this.database.query.fiscalDocuments.findMany({
      where: and(
        eq(schema.fiscalDocuments.status, 'rejected'),
        lt(schema.fiscalDocuments.attemptCount, MAX_RETRY_ATTEMPTS)
      ),
      limit: 50,
    })

    if (documents.length === 0) return { retried: 0, failed: 0 }

    const configCache = new Map<string, FiscalConfiguration | null>()
    let retried = 0
    let failed = 0

    for (const document of documents) {
      try {
        let fiscalConfig = configCache.get(document.establishmentId)
        if (fiscalConfig === undefined) {
          fiscalConfig =
            (await this.database.query.fiscalConfigurations.findFirst({
              where: eq(schema.fiscalConfigurations.establishmentId, document.establishmentId),
            })) ?? null
          configCache.set(document.establishmentId, fiscalConfig)
        }

        if (!fiscalConfig || fiscalConfig.model === 'none' || !fiscalConfig.active) continue

        await this.enqueueRetry(document)
        retried++
      } catch {
        failed++
      }
    }

    return { retried, failed }
  }

  // Reset a rejected document back to pending and re-enqueue it — the fiscal worker re-emits.
  private async enqueueRetry(document: schema.FiscalDocument): Promise<schema.FiscalDocument> {
    const [updated] = await this.database
      .update(schema.fiscalDocuments)
      .set({
        status: 'pending',
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.fiscalDocuments.id, document.id))
      .returning()

    await this.websocketHub.publishBroadcast(document.establishmentId, WS_EVENTS.FISCAL_EMITTING, {
      fiscalDocumentId: document.id,
      orderId: document.orderId,
      retry: true,
    })

    await fiscalQueue.add(FISCAL_JOB.EMIT, {
      fiscalDocumentId: document.id,
      establishmentId: document.establishmentId,
    })

    return updated!
  }
}
