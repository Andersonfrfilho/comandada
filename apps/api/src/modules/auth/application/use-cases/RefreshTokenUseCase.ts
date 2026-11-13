import { SignJWT } from 'jose'
import { createHash, randomBytes } from 'crypto'
import type { UserRepository } from '../../domain/repositories/UserRepository'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import { UnauthorizedError } from '@/shared/errors/AppError'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'change-me')
const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7

interface RefreshOutput {
  accessToken: string
  refreshToken: string
}

export class RefreshTokenUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly cache: CacheProvider
  ) {}

  async execute(rawRefreshToken: string): Promise<RefreshOutput> {
    const [familyId, tokenPart] = rawRefreshToken.split('.')
    if (!familyId || !tokenPart) throw new UnauthorizedError('invalid_refresh_token')

    const tokenHash = createHash('sha256').update(tokenPart).digest('hex')
    const refreshTokenKey = `refresh:${tokenHash}`
    const familyKey = `refresh:family:${familyId}`

    const [storedRaw, familyCurrentHash] = await Promise.all([
      this.cache.get(refreshTokenKey),
      this.cache.get(familyKey),
    ])

    // Token reuse detected — invalidate entire family
    if (!storedRaw || familyCurrentHash !== tokenHash) {
      if (familyCurrentHash) {
        await Promise.all([
          this.cache.delete(`refresh:${familyCurrentHash}`),
          this.cache.delete(familyKey),
        ])
      }
      throw new UnauthorizedError('invalid_refresh_token')
    }

    const { userId } = JSON.parse(storedRaw) as { userId: string; familyId: string }

    // Invalidate used token
    await this.cache.delete(refreshTokenKey)

    const userWithRole = await this.userRepository.findByIdWithRole(userId)
    if (!userWithRole || !userWithRole.active) {
      await this.cache.delete(familyKey)
      throw new UnauthorizedError('invalid_refresh_token')
    }

    const accessToken = await new SignJWT({
      establishmentId: userWithRole.establishmentId,
      email: userWithRole.email,
      name: userWithRole.name,
      role: userWithRole.role.name,
      permissions: userWithRole.role.permissions,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userWithRole.id)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_TTL)
      .sign(JWT_SECRET)

    // Issue new refresh token (rotation)
    const newRawToken = randomBytes(32).toString('hex')
    const newTokenHash = createHash('sha256').update(newRawToken).digest('hex')
    const newRefreshTokenKey = `refresh:${newTokenHash}`

    await Promise.all([
      this.cache.set(
        newRefreshTokenKey,
        JSON.stringify({ userId, familyId }),
        REFRESH_TOKEN_TTL_SECONDS
      ),
      this.cache.set(familyKey, newTokenHash, REFRESH_TOKEN_TTL_SECONDS),
    ])

    return {
      accessToken,
      refreshToken: `${familyId}.${newRawToken}`,
    }
  }
}
