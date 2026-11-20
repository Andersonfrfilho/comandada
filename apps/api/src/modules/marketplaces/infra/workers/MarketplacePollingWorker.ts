import { Worker, type ConnectionOptions } from 'bullmq'
import { queueConnection } from '@/infra/queue/redisConnection'
import { marketplacePollingQueue } from '@/infra/queue/marketplaceQueue'
import { MARKETPLACE_POLLING_JOB, MARKETPLACE_POLLING_QUEUE } from '@/infra/queue/QueueNames.constant'
import type { MarketplaceOrderService } from '../../application/MarketplaceOrderService'

// O iFood pede polling a cada 30 s (é o que a homologação confere); o Open Delivery segue o mesmo ritmo.
export const MARKETPLACE_POLL_INTERVAL_MS = 30_000

export function startMarketplacePollingWorker(service: MarketplaceOrderService): Worker {
  const worker = new Worker(
    MARKETPLACE_POLLING_QUEUE,
    async (job) => {
      if (job.name === MARKETPLACE_POLLING_JOB.POLL) await service.pollAll()
    },
    // Um polling por vez: dois ao mesmo tempo podiam importar o mesmo pedido em paralelo.
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 1 }
  )

  void marketplacePollingQueue
    .add(
      MARKETPLACE_POLLING_JOB.POLL,
      {},
      { repeat: { every: MARKETPLACE_POLL_INTERVAL_MS }, jobId: 'marketplace-poll' }
    )
    .catch((error: unknown) => console.error('[Marketplaces] agendamento do polling falhou', error))

  worker.on('failed', (job, error) => console.error('[Marketplaces] polling falhou', job?.id, error?.message))
  worker.on('error', (error) => console.error('[Marketplaces] worker', error.message))
  return worker
}
