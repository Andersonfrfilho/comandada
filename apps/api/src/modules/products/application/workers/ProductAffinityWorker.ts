import { Worker, type ConnectionOptions } from 'bullmq'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { queueConnection } from '@/infra/queue/redisConnection'
import { PRODUCT_AFFINITY_QUEUE, PRODUCT_AFFINITY_JOB } from '@/infra/queue/QueueNames.constant'
import { calculateProductAffinities, scheduleProductAffinityCalculation } from './ProductAffinityCalculator'

type Database = NodePgDatabase<typeof schema>

export function startProductAffinityWorker(database: Database): Worker {
  const worker = new Worker(
    PRODUCT_AFFINITY_QUEUE,
    async (job) => {
      if (job.name === PRODUCT_AFFINITY_JOB.CALCULATE) {
        await calculateProductAffinities(database)
      }
    },
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 1 }
  )

  void scheduleProductAffinityCalculation()

  worker.on('failed', (job, err) => {
    console.error('[ProductAffinityWorker] job failed', job?.id, err?.message)
  })

  worker.on('error', (err) => console.error('[ProductAffinityWorker] error', err.message))

  return worker
}
