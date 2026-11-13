import { createHash, timingSafeEqual } from 'crypto'
import type { Middleware } from '../router'
import { UnauthorizedError } from '@/shared/errors/AppError'

const MINIMUM_TOKEN_LENGTH = 32

// Fail closed: without a real token configured, every internal route answers 401.
const INTERNAL_API_TOKEN = process.env.N8N_INTERNAL_API_TOKEN ?? ''
const isTokenConfigured = INTERNAL_API_TOKEN.length >= MINIMUM_TOKEN_LENGTH
const expectedDigest = createHash('sha256').update(INTERNAL_API_TOKEN).digest()

if (!isTokenConfigured) {
  console.warn('[API] N8N_INTERNAL_API_TOKEN missing or shorter than 32 chars: internal routes are disabled')
}

function matchesInternalToken(token: string): boolean {
  const receivedDigest = createHash('sha256').update(token).digest()
  return timingSafeEqual(receivedDigest, expectedDigest)
}

export const internalAuth: Middleware = async (request, _response, next) => {
  const token = request.headers['x-internal-token']

  if (!isTokenConfigured || !token || !matchesInternalToken(token)) {
    throw new UnauthorizedError('invalid_internal_token')
  }

  await next()
}
