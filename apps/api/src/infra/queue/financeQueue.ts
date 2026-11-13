import { Queue, type ConnectionOptions } from 'bullmq'

import { queueConnection } from './redisConnection'
import { FINANCE_DUE_ALERTS_QUEUE, type FinanceDueJobName } from './QueueNames.constant'

export const financeDueQueue = new Queue<Record<string, never>, unknown, FinanceDueJobName>(FINANCE_DUE_ALERTS_QUEUE, {
  connection: queueConnection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 60000 },
    removeOnComplete: { age: 86400, count: 100 },
    removeOnFail: { age: 604800, count: 100 },
  },
})
