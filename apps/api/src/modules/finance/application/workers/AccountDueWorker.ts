import { Worker, type ConnectionOptions } from 'bullmq'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { queueConnection } from '@/infra/queue/redisConnection'
import { FINANCE_DUE_ALERTS_QUEUE, FINANCE_DUE_JOB } from '@/infra/queue/QueueNames.constant'
import { scanDueAccounts, scheduleAccountDueScan } from './AccountDueAlerter'

type Database = NodePgDatabase<typeof schema>

export function startFinanceWorker(database: Database): Worker {
  const worker = new Worker(
    FINANCE_DUE_ALERTS_QUEUE,
    async (job) => {
      if (job.name === FINANCE_DUE_JOB.SCAN_DUE_ACCOUNTS) {
        await scanDueAccounts(database)
      }
    },
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 1 }
  )

  void scheduleAccountDueScan()

  worker.on('failed', (job, err) => {
    console.error('[FinanceWorker] job failed', job?.id, err?.message)
  })

  worker.on('error', (err) => console.error('[FinanceWorker] error', err.message))

  return worker
}
