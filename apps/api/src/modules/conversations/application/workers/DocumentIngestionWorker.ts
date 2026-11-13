import { Worker, type ConnectionOptions } from 'bullmq'
import { queueConnection } from '@/infra/queue/redisConnection'
import {
  CONVERSATION_DOCUMENTS_QUEUE,
  CONVERSATION_DOCUMENTS_JOB,
  type ConversationDocumentsJobData,
} from '@/infra/queue/QueueNames.constant'
import type { MetaWhatsAppModuleRegistry } from '../../infra/whatsapp/metaWhatsAppModule'

interface DocumentIngestionWorkerParams {
  readonly modules: MetaWhatsAppModuleRegistry
}

/**
 * Copia para o storage próprio o anexo que o cliente mandou. Roda fora do webhook porque a URL da
 * Meta expira e baixar dentro do handler faria a Meta reentregar o evento.
 */
export function startDocumentIngestionWorker(params: DocumentIngestionWorkerParams): Worker {
  const worker = new Worker<ConversationDocumentsJobData>(
    CONVERSATION_DOCUMENTS_QUEUE,
    async (job) => {
      if (job.name !== CONVERSATION_DOCUMENTS_JOB.INGEST_INBOUND_MEDIA) return

      const ingest = params.modules.forEstablishment(job.data.companyId).ingestInboundMedia
      if (!ingest) return

      await ingest.execute({
        companyId: job.data.companyId,
        messageId: job.data.messageId,
        sourceMediaId: job.data.sourceMediaId,
        mimeType: job.data.mimeType,
        ...(job.data.filename ? { filename: job.data.filename } : {}),
      })
    },
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 4 }
  )

  // Sem `filename` nem número: nome de arquivo enviado por cliente é dado dele, e o id do job já
  // basta para achar o anexo que falhou.
  worker.on('failed', (job, error) => {
    console.error('[DocumentIngestionWorker] job failed', job?.id, error?.message)
  })

  worker.on('error', (error) => console.error('[DocumentIngestionWorker] error', error.message))

  return worker
}
