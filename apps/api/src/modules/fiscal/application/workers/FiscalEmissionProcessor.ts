import { Worker, type ConnectionOptions } from 'bullmq'
import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { queueConnection } from '@/infra/queue/redisConnection'
import { FISCAL_QUEUE, FISCAL_JOB, type FiscalEmitJobData, type FiscalDeliverJobData } from '@/infra/queue/QueueNames.constant'
import { FiscalEmissionService, extractFiscalErrorCode } from '../FiscalEmissionService'
import { DeliverFiscalDocumentUseCase } from '../use-cases/DeliverFiscalDocumentUseCase'
import { ResendDeliveryProvider } from '../delivery/ResendDeliveryProvider'
import { SmtpDeliveryProvider } from '../delivery/SmtpDeliveryProvider'
import { WhatsappDeliveryProvider } from '../delivery/WhatsappDeliveryProvider'
import type { BotMessageProvider } from '@/shared/providers/BotMessageProvider'
import { runFiscalSweep, scheduleFiscalSweep } from './FiscalSweeper'

type Database = NodePgDatabase<typeof schema>

export function startFiscalWorker(params: { database: Database; websocketHub: WebSocketHub; botMessages: BotMessageProvider }): Worker {
  const { database, websocketHub, botMessages } = params
  const service = new FiscalEmissionService(database, websocketHub)
  const deliverUseCase = new DeliverFiscalDocumentUseCase(database, new WhatsappDeliveryProvider(botMessages), {
    resend: new ResendDeliveryProvider(),
    smtp: new SmtpDeliveryProvider(),
  })

  const worker = new Worker(
    FISCAL_QUEUE,
    async (job) => {
      if (job.name === FISCAL_JOB.EMIT) {
        await service.process(job.data as FiscalEmitJobData)
        return
      }
      if (job.name === FISCAL_JOB.DELIVER) {
        await deliverUseCase.execute(job.data as FiscalDeliverJobData)
        return
      }
      if (job.name === FISCAL_JOB.SWEEP) {
        await runFiscalSweep(database)
      }
    },
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 2 }
  )

  void scheduleFiscalSweep()

  worker.on('failed', (job, err) => {
    console.error('[FiscalWorker] job failed', job?.id, err?.message)
    if (!job || job.name !== FISCAL_JOB.EMIT) return
    const attemptsExhausted = job.attemptsMade >= (job.opts.attempts ?? 1)
    if (!attemptsExhausted) return

    // Retries exhausted: reject and preserve the underlying error code so the sweeper can decide
    // whether it is safe to auto-re-emit (connection failure) or must be reviewed (timeout/fatal).
    const { fiscalDocumentId, establishmentId } = job.data as FiscalEmitJobData
    void markExhaustedAsRejected({
      database,
      websocketHub,
      fiscalDocumentId,
      establishmentId,
      errorCode: extractFiscalErrorCode(err),
      errorMessage: err?.message,
    })
  })

  worker.on('error', (err) => console.error('[FiscalWorker] error', err.message))

  return worker
}

async function markExhaustedAsRejected(params: {
  database: Database
  websocketHub: WebSocketHub
  fiscalDocumentId: string
  establishmentId: string
  errorCode: string
  errorMessage: string | undefined
}): Promise<void> {
  const { database, websocketHub, fiscalDocumentId, establishmentId, errorCode, errorMessage } = params
  const message = errorMessage ?? 'Emissão falhou após esgotar as tentativas'

  await database.update(schema.fiscalDocuments)
    .set({ status: 'rejected', errorCode, errorMessage: message, updatedAt: new Date() })
    .where(eq(schema.fiscalDocuments.id, fiscalDocumentId))

  await websocketHub.publishBroadcast(establishmentId, WS_EVENTS.FISCAL_REJECTED, {
    fiscalDocumentId,
    errorCode,
    errorMessage: message,
  })
}
