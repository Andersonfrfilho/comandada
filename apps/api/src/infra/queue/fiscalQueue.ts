import { Queue, type ConnectionOptions } from 'bullmq'

import { queueConnection } from './redisConnection'
import { FISCAL_QUEUE, type FiscalJobData, type FiscalJobName } from './QueueNames.constant'

// Retention is mandatory to avoid unbounded growth in Redis.
// Failures (30d) outlive successes (7d) to allow investigation and retry.
export const fiscalQueue = new Queue<FiscalJobData, unknown, FiscalJobName>(FISCAL_QUEUE, {
  // ioredis instance is a valid BullMQ connection; cast bridges a types-version mismatch
  connection: queueConnection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 604_800, count: 2000 },
    removeOnFail: { age: 2_592_000, count: 2000 },
  },
})
