import { Queue, type ConnectionOptions } from 'bullmq'

import { queueConnection } from './redisConnection'
import { PRODUCT_AFFINITY_QUEUE, type ProductAffinityJobName } from './QueueNames.constant'

export const productAffinityQueue = new Queue<Record<string, never>, unknown, ProductAffinityJobName>(
  PRODUCT_AFFINITY_QUEUE,
  {
    connection: queueConnection as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'fixed', delay: 60000 },
      removeOnComplete: { age: 86400, count: 100 },
      removeOnFail: { age: 604800, count: 100 },
    },
  }
)
