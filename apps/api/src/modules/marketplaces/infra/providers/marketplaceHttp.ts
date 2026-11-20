import { MarketplaceApiError, type MarketplacePlatform } from '../../domain/Marketplace'

export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>

interface CachedToken {
  accessToken: string
  expiresAt: number
}

/**
 * Token OAuth guardado até vencer (menos `marginSeconds`); um pedido de token por vez. O iFood pede
 * para renovar só quando vence, então lá a margem é zero e o 401 dispara a renovação.
 */
export class TokenCache {
  private cached: CachedToken | null = null
  private pending: Promise<string> | null = null

  constructor(
    private readonly fetchToken: () => Promise<{ accessToken: string; expiresInSeconds: number }>,
    private readonly marginSeconds = 120
  ) {}

  async get(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt) return this.cached.accessToken
    if (!this.pending) {
      this.pending = this.fetchToken()
        .then((token) => {
          const lifetimeSeconds = Math.max(token.expiresInSeconds - this.marginSeconds, 30)
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

/**
 * JSON.parse que guarda inteiros grandes como texto. Algumas plataformas usam ids de 64 bits
 * (5764607801871631353), que viram outro número no JSON.parse comum.
 */
export function parseJsonKeepingBigInts<T = unknown>(text: string): T {
  const protectedText = text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"')
  return JSON.parse(protectedText) as T
}

/** Espera antes de repetir uma chamada recusada por limite (429) ou erro temporário (5xx). */
export async function withRetry(
  send: () => Promise<Response>,
  options: { attempts?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  const attempts = options.attempts ?? 3
  const baseDelay = options.baseDelayMs ?? 500
  let response = await send()
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (response.status !== 429 && response.status < 500) return response
    const retryAfter = Number(response.headers.get('retry-after'))
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : baseDelay * 2 ** (attempt - 1)
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 10_000)))
    response = await send()
  }
  return response
}

/** Converte YYYY-MM-DD em YYYYMMDD. */
export function compactDate(date: string): string {
  return date.replaceAll('-', '')
}

/** Dias entre duas datas YYYY-MM-DD (inclusivo). */
export function daysInRange(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
}
