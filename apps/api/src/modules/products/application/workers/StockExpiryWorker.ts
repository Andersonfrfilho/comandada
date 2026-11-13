import { Worker, type ConnectionOptions } from 'bullmq'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { queueConnection } from '@/infra/queue/redisConnection'
import { STOCK_EXPIRY_ALERTS_QUEUE, STOCK_EXPIRY_JOB } from '@/infra/queue/QueueNames.constant'
import { scanExpiringBatches, scheduleStockExpiryScan } from './StockExpiryAlerter'

type Database = NodePgDatabase<typeof schema>

export function startStockWorker(database: Database): Worker {
  const worker = new Worker(
    STOCK_EXPIRY_ALERTS_QUEUE,
    async (job) => {
      if (job.name === STOCK_EXPIRY_JOB.SCAN_EXPIRING) {
        await scanExpiringBatches(database)
      }
    },
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 1 }
  )

  void scheduleStockExpiryScan()

  worker.on('failed', (job, err) => {
    console.error('[StockWorker] job failed', job?.id, err?.message)
  })

  worker.on('error', (err) => console.error('[StockWorker] error', err.message))

  return worker
}
