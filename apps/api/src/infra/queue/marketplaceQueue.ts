import { Queue, type ConnectionOptions } from 'bullmq'

import { queueConnection } from './redisConnection'
import { MARKETPLACE_POLLING_QUEUE, type MarketplacePollingJobName } from './QueueNames.constant'

export const marketplacePollingQueue = new Queue<Record<string, never>, unknown, MarketplacePollingJobName>(
  MARKETPLACE_POLLING_QUEUE,
  {
    connection: queueConnection as ConnectionOptions,
    defaultJobOptions: {
      // O próximo polling já busca de novo: não vale repetir o que falhou.
      attempts: 1,
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 100 },
    },
  }
)
