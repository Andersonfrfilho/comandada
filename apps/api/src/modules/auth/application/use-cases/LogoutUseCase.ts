import { createHash } from 'crypto'
import type { CacheProvider } from '@/shared/providers/CacheProvider'

export class LogoutUseCase {
  constructor(private readonly cache: CacheProvider) {}

  async execute(rawRefreshToken: string): Promise<void> {
    const [familyId, tokenPart] = rawRefreshToken.split('.')
    if (!familyId || !tokenPart) return

    const tokenHash = createHash('sha256').update(tokenPart).digest('hex')

    await Promise.all([
      this.cache.delete(`refresh:${tokenHash}`),
      this.cache.delete(`refresh:family:${familyId}`),
    ])
  }
}
