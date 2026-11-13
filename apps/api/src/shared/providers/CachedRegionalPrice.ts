import type { CacheProvider } from './CacheProvider'
import type {
  RegionalPriceProvider,
  RegionalPriceQuery,
  RegionalPriceQuote,
  RegionalPriceResolver,
} from './RegionalPriceProvider'
import { regionalPriceQuoteSchema } from './RegionalPriceProvider'
import {
  REGIONAL_PRICE_CACHE_PREFIX,
  REGIONAL_PRICE_EMPTY_MARKER,
  REGIONAL_PRICE_TTL_SECONDS,
} from '@/shared/constants/regionalPrice.constant'

/**
 * Cache + roteamento por UF na frente dos portais estaduais de NFC-e.
 *
 * A cobertura é estadual por natureza, então quem resolve a consulta é o provider
 * cuja UF bate com a do estabelecimento. UF sem provider devolve `null` — é o caso
 * comum, e a tela deve dizer "indisponível na sua região", não "erro".
 *
 * Miss é cacheado: a maioria das consultas não terá cobertura, e sem isso cada
 * digitação pagaria a lentidão do portal.
 */
export class CachedRegionalPrice implements RegionalPriceProvider, RegionalPriceResolver {
  readonly name = 'cached'
  readonly state = '--'

  constructor(
    private readonly cache: CacheProvider,
    private readonly providers: readonly RegionalPriceProvider[]
  ) {}

  private cacheKey(state: string, query: RegionalPriceQuery): string {
    return `${REGIONAL_PRICE_CACHE_PREFIX}${state}:${query.barcode}:${query.postalCode}:${query.radiusKm}`
  }

  // Revalida o que sai do cache: entrada gravada antes de mudança de formato não pode
  // vazar para a tela como se fosse um preço válido.
  private parseCached(raw: string): RegionalPriceQuote | null {
    try {
      const parsed = regionalPriceQuoteSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  async getQuoteForState(
    state: string,
    query: RegionalPriceQuery
  ): Promise<RegionalPriceQuote | null> {
    const provider = this.providers.find((candidate) => candidate.state === state.toUpperCase())
    if (!provider) return null

    const key = this.cacheKey(provider.state, query)

    const raw = await this.cache.get(key)
    if (raw === REGIONAL_PRICE_EMPTY_MARKER) return null
    if (raw !== null) {
      const cached = this.parseCached(raw)
      if (cached) return cached
    }

    const quote = await provider.getQuote(query)

    await this.cache.set(
      key,
      quote ? JSON.stringify(quote) : REGIONAL_PRICE_EMPTY_MARKER,
      quote ? REGIONAL_PRICE_TTL_SECONDS.HIT : REGIONAL_PRICE_TTL_SECONDS.MISS
    )

    return quote
  }

  /** Sem UF explícita, tenta os providers configurados na ordem — só útil com um único estado. */
  async getQuote(query: RegionalPriceQuery): Promise<RegionalPriceQuote | null> {
    for (const provider of this.providers) {
      const quote = await this.getQuoteForState(provider.state, query)
      if (quote) return quote
    }
    return null
  }
}
