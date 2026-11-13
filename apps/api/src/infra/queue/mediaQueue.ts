import { Queue, type ConnectionOptions } from 'bullmq'

import { queueConnection } from './redisConnection'
import {
  MEDIA_PROCESSING_QUEUE,
  type MediaProcessingJobData,
  type MediaProcessingJobName,
} from './QueueNames.constant'

export const mediaQueue = new Queue<MediaProcessingJobData, unknown, MediaProcessingJobName>(
  MEDIA_PROCESSING_QUEUE,
  {
    connection: queueConnection as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'fixed', delay: 5000 },
      removeOnComplete: { age: 86400, count: 500 },
      removeOnFail: { age: 604800, count: 500 },
    },
  }
)
