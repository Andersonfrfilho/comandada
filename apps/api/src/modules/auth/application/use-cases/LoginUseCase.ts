import { SignJWT } from 'jose'
import { createHash, randomBytes } from 'crypto'
import type { UserRepository } from '../../domain/repositories/UserRepository'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import {
  UnauthorizedError,
  LockedError,
} from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import argon2 from 'argon2'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'change-me')
const JWT_REFRESH_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET ?? 'change-refresh')
const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_SECONDS = 60 * 15 // 15 minutes

interface LoginInput {
  email: string
  password: string
}

interface LoginOutput {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    name: string
    email: string
    role: string
    establishmentId: string
    passwordMustChange: boolean
  }
}

export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly cache: CacheProvider
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const lockKey = `auth:lock:${input.email}`
    const attemptsKey = `auth:attempts:${input.email}`

    // Check if account is locked
    const isLocked = await this.cache.exists(lockKey)
    if (isLocked) {
      const ttl = await this.cache.ttl(lockKey)
      throw new LockedError(MessagesConstants.auth.accountLocked, ttl > 0 ? ttl : LOCK_DURATION_SECONDS)
    }

    const user = await this.userRepository.findByEmail(input.email)

    // Always verify password (even against dummy hash) to prevent timing attacks
    const passwordMatches = user
      ? await argon2.verify(user.passwordHash, input.password)
      : await argon2.verify('$argon2id$v=19$m=65536,t=2,p=1$dummy$dummy', input.password)

    if (!user || !passwordMatches || !user.active) {
      const attempts = await this.cache.increment(attemptsKey)
      if (attempts === 1) {
        await this.cache.expire(attemptsKey, LOCK_DURATION_SECONDS)
      }

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await this.cache.set(lockKey, '1', LOCK_DURATION_SECONDS)
        await this.cache.delete(attemptsKey)
        throw new LockedError(MessagesConstants.auth.accountLocked, LOCK_DURATION_SECONDS)
      }

      throw new UnauthorizedError('invalid_credentials')
    }

    // Clear failed attempts on success
    await this.cache.delete(attemptsKey)

    const userWithRole = await this.userRepository.findByIdWithRole(user.id)
    if (!userWithRole) throw new UnauthorizedError('invalid_credentials')

    const permissions = userWithRole.role.permissions

    const accessToken = await new SignJWT({
      establishmentId: user.establishmentId,
      email: user.email,
      name: user.name,
      role: userWithRole.role.name,
      permissions,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_TTL)
      .sign(JWT_SECRET)

    // Refresh token: random opaque token, stored as SHA-256 hash in Redis
    const familyId = randomBytes(16).toString('hex')
    const rawRefreshToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex')
    const refreshTokenKey = `refresh:${tokenHash}`
    const familyKey = `refresh:family:${familyId}`

    await Promise.all([
      this.cache.set(
        refreshTokenKey,
        JSON.stringify({ userId: user.id, familyId }),
        REFRESH_TOKEN_TTL_SECONDS
      ),
      this.cache.set(familyKey, tokenHash, REFRESH_TOKEN_TTL_SECONDS),
    ])

    // Encode familyId into refresh token so client sends: <familyId>.<rawToken>
    const refreshToken = `${familyId}.${rawRefreshToken}`

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: userWithRole.role.name,
        establishmentId: user.establishmentId,
        passwordMustChange: user.passwordMustChange,
      },
    }
  }
}
