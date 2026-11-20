import { MarketplaceApiError, type MarketplacePlatform } from '../../domain/Marketplace'

export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>

interface CachedToken {
  accessToken: string
  expiresAt: number
}

/** Token OAuth guardado até 2 min antes de vencer; um pedido de token por vez. */
export class TokenCache {
  private cached: CachedToken | null = null
  private pending: Promise<string> | null = null

  constructor(private readonly fetchToken: () => Promise<{ accessToken: string; expiresInSeconds: number }>) {}

  async get(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt) return this.cached.accessToken
    if (!this.pending) {
      this.pending = this.fetchToken()
        .then((token) => {
          const lifetimeSeconds = Math.max(token.expiresInSeconds - 120, 30)
          this.cached = { accessToken: token.accessToken, expiresAt: Date.now() + lifetimeSeconds * 1000 }
          return token.accessToken
        })
        .finally(() => {
          this.pending = null
        })
    }
    return this.pending
  }

  invalidate(): void {
    this.cached = null
  }
}

export async function readJsonOrThrow<T>(
  response: Response,
  platform: MarketplacePlatform,
  operation: string
): Promise<T> {
  if (!response.ok) throw new MarketplaceApiError(platform, operation, response.status, await response.text())
  return (await response.json()) as T
}

export async function ensureOk(response: Response, platform: MarketplacePlatform, operation: string): Promise<void> {
  if (!response.ok) throw new MarketplaceApiError(platform, operation, response.status, await response.text())
}

/** Valor que pode vir como número ou como `{ value }` (Open Delivery). */
export function moneyValue(input: unknown): number {
  if (typeof input === 'number') return input
  if (typeof input === 'string') return Number(input) || 0
  if (input && typeof input === 'object' && 'value' in input) return moneyValue((input as { value: unknown }).value)
  return 0
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
