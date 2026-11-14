import { Worker, type ConnectionOptions } from 'bullmq'
import { queueConnection } from '@/infra/queue/redisConnection'
import { WHATSAPP_INBOUND_QUEUE, type WhatsAppInboundJobData } from '@/infra/queue/QueueNames.constant'
import { forwardWhatsAppInbound } from './ForwardWhatsAppInboundProcessor'

export function startWhatsAppInboundWorker(): Worker<WhatsAppInboundJobData> {
  const botWebhookUrl = process.env.N8N_BOT_WEBHOOK_URL
  if (!botWebhookUrl) {
    // Sobe mesmo assim: os jobs ficam na fila tentando, e o erro aparece no boot, antes do
    // primeiro cliente ficar sem resposta.
    console.error('[WhatsAppInboundWorker] N8N_BOT_WEBHOOK_URL not set — messages will wait in the queue')
  }

  const worker = new Worker<WhatsAppInboundJobData>(
    WHATSAPP_INBOUND_QUEUE,
    async (job) => {
      await forwardWhatsAppInbound(job.data, botWebhookUrl)
      console.log('[WhatsAppInboundWorker] forwarded', {
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        latencyMs: Date.now() - job.data.receivedAt,
      })
    },
    // Ordem de chegada importa na conversa (o "2" depois do "cardápio"): um job por vez.
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 1 }
  )

  worker.on('failed', (job, error) => {
    const exhausted = job ? job.attemptsMade >= (job.opts.attempts ?? 1) : false
    console.error('[WhatsAppInboundWorker] job failed', {
      jobId: job?.id,
      attempt: job?.attemptsMade,
      exhausted,
      error: error?.message,
    })
  })
  worker.on('error', (error) => console.error('[WhatsAppInboundWorker] error', error.message))

  return worker
}
