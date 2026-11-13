import type { Middleware } from '../router'
import { RateLimitError } from '@/shared/errors/AppError'
import type { CacheProvider } from '@/shared/providers/CacheProvider'

interface RateLimiterOptions {
  windowSeconds: number
  maxRequests: number
  keyPrefix: string
}

// Sliding window counter via Redis INCR + EXPIRE.
// Key: `rl:<keyPrefix>:<identifier>`
export function rateLimiter(cache: CacheProvider, options: RateLimiterOptions): Middleware {
  const { windowSeconds, maxRequests, keyPrefix } = options

  return async (request, response, next) => {
    const identifier =
      request.user?.id ?? request.headers['x-forwarded-for'] ?? request.headers['cf-connecting-ip'] ?? 'anonymous'

    const key = `rl:${keyPrefix}:${identifier}`
    const current = await cache.increment(key)
    if (current === 1) {
      await cache.expire(key, windowSeconds)
    }

    if (current > maxRequests) {
      const ttl = await cache.ttl(key)
      throw new RateLimitError(ttl > 0 ? ttl : windowSeconds)
    }

    await next()
  }
}
