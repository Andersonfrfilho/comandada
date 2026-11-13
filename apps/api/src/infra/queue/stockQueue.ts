import { Queue, type ConnectionOptions } from 'bullmq'

import { queueConnection } from './redisConnection'
import { STOCK_EXPIRY_ALERTS_QUEUE, type StockExpiryJobName } from './QueueNames.constant'

export const stockExpiryQueue = new Queue<Record<string, never>, unknown, StockExpiryJobName>(STOCK_EXPIRY_ALERTS_QUEUE, {
  connection: queueConnection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 60000 },
    removeOnComplete: { age: 86400, count: 100 },
    removeOnFail: { age: 604800, count: 100 },
  },
})
