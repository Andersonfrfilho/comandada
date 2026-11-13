import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

// BullMQ requires maxRetriesPerRequest: null to allow internal blocking operations (e.g. BRPOPLPUSH)
// without ioredis aborting them mid-flight. Reusing the app redisClient (maxRetriesPerRequest: 3) breaks the queue.
export const queueConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
})
