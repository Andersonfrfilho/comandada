import { ifoodPollingQueue } from '@/infra/queue/ifoodQueue'
import { IFOOD_POLLING_JOB } from '@/infra/queue/QueueNames.constant'

const POLL_INTERVAL_MS = 60_000

export async function scheduleIfoodPolling(): Promise<void> {
  await ifoodPollingQueue.add(
    IFOOD_POLLING_JOB.POLL,
    {},
    {
      repeat: { every: POLL_INTERVAL_MS },
      jobId: 'ifood-poll',
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    }
  )
}
