import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy(times) {
    if (times > 10) return null
    return Math.min(times * 100, 2000)
  },
})

redisClient.on('error', (error: Error) => {
  console.error('[Redis] Connection error:', error.message)
})

redisClient.on('connect', () => {
  console.log('[Redis] Connected')
})

export async function checkRedisConnection(): Promise<void> {
  const result = await redisClient.ping()
  if (result !== 'PONG') throw new Error('Redis ping failed')
}
