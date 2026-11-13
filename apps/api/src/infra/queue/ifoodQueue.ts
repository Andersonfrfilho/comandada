import { Queue, type ConnectionOptions } from 'bullmq'

import { queueConnection } from './redisConnection'
import { IFOOD_POLLING_QUEUE, type IfoodPollingJobName } from './QueueNames.constant'

export const ifoodPollingQueue = new Queue<Record<string, never>, unknown, IfoodPollingJobName>(IFOOD_POLLING_QUEUE, {
  connection: queueConnection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 30000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 100 },
  },
})
