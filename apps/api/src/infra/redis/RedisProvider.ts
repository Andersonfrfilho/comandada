import type { CacheProvider } from '@/shared/providers/CacheProvider'
import { redisClient } from './connection'
import Redis from 'ioredis'

export class RedisProvider implements CacheProvider {
  // subscriber needs its own connection — a subscribed client cannot issue other commands
  private readonly subscriber: Redis

  constructor() {
    this.subscriber = redisClient.duplicate()
    this.subscriber.on('error', (error: Error) => {
      console.error('[Redis] Subscriber error:', error.message)
    })
  }

  async get(key: string): Promise<string | null> {
    return redisClient.get(key)
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await redisClient.setex(key, ttlSeconds, value)
    } else {
      await redisClient.set(key, value)
    }
  }

  async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await redisClient.set(key, value, 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  }

  async delete(key: string): Promise<void> {
    await redisClient.del(key)
  }

  async exists(key: string): Promise<boolean> {
    const count = await redisClient.exists(key)
    return count === 1
  }

  async increment(key: string): Promise<number> {
    return redisClient.incr(key)
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await redisClient.expire(key, ttlSeconds)
  }

  async ttl(key: string): Promise<number> {
    return redisClient.ttl(key)
  }

  async publish(channel: string, message: string): Promise<void> {
    await redisClient.publish(channel, message)
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel)
    this.subscriber.on('message', (receivedChannel: string, message: string) => {
      if (receivedChannel === channel) {
        callback(message)
      }
    })
  }
}
