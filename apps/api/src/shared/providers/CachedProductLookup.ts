import { z } from 'zod'

import type { CacheProvider } from './CacheProvider'
import type { ProductLookupProvider, ProductSuggestion } from './ProductLookupProvider'
import { productSuggestionSchema } from './ProductLookupProvider'
import {
  PRODUCT_LOOKUP_CACHE_PREFIX,
  PRODUCT_LOOKUP_EMPTY_MARKER,
  PRODUCT_LOOKUP_TTL_SECONDS,
} from '@/shared/constants/productLookup.constant'

const cachedSuggestionsSchema = z.array(productSuggestionSchema)

/**
 * Cache + cadeia de fallback ordenada na frente das bases externas de produto.
 *
 * A ordem dos providers é a ordem de tentativa, e o primeiro que responder ganha:
 * cache → provider[0] → provider[1] → ... → nada. Implementa a própria interface
 * `ProductLookupProvider`, então quem consome não sabe se veio de cache ou de rede.
 *
 * Miss também é cacheado. Sem isso, todo item fora da base — hortifrúti, prato
 * pronto, serviço, que são a maioria neste domínio — pagaria a chamada de rede em
 * toda digitação.
 */
export class CachedProductLookup implements ProductLookupProvider {
  readonly name = 'cached'

  constructor(
    private readonly cache: CacheProvider,
    private readonly providers: readonly ProductLookupProvider[]
  ) {}

  // Sem normalizar, "Coca Cola" e "coca  cola" viram duas entradas para a mesma busca.
  private searchKey(query: string): string {
    const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ')
    return `${PRODUCT_LOOKUP_CACHE_PREFIX.SEARCH}${normalized}`
  }

  // Revalida o que sai do cache: uma entrada gravada antes de uma mudança de formato
  // não pode vazar para dentro do formulário como se fosse válida.
  private parseCached(raw: string): readonly ProductSuggestion[] | null {
    try {
      const parsed = cachedSuggestionsSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private async readCache(key: string): Promise<readonly ProductSuggestion[] | null | undefined> {
    const raw = await this.cache.get(key)
    if (raw === null) return undefined
    if (raw === PRODUCT_LOOKUP_EMPTY_MARKER) return null
    return this.parseCached(raw) ?? undefined
  }

  private async writeCache(key: string, suggestions: readonly ProductSuggestion[]): Promise<void> {
    const isEmpty = suggestions.length === 0
    await this.cache.set(
      key,
      isEmpty ? PRODUCT_LOOKUP_EMPTY_MARKER : JSON.stringify(suggestions),
      isEmpty ? PRODUCT_LOOKUP_TTL_SECONDS.MISS : PRODUCT_LOOKUP_TTL_SECONDS.HIT
    )
  }

  async search(query: string): Promise<readonly ProductSuggestion[]> {
    const key = this.searchKey(query)

    const cached = await this.readCache(key)
    if (cached !== undefined) return cached ?? []

    for (const provider of this.providers) {
      const suggestions = await provider.search(query)
      if (suggestions.length > 0) {
        await this.writeCache(key, suggestions)
        return suggestions
      }
    }

    await this.writeCache(key, [])
    return []
  }

  async getByBarcode(barcode: string): Promise<ProductSuggestion | null> {
    const key = `${PRODUCT_LOOKUP_CACHE_PREFIX.BARCODE}${barcode}`

    const cached = await this.readCache(key)
    if (cached !== undefined) return cached?.[0] ?? null

    for (const provider of this.providers) {
      const suggestion = await provider.getByBarcode(barcode)
      if (suggestion) {
        await this.writeCache(key, [suggestion])
        return suggestion
      }
    }

    await this.writeCache(key, [])
    return null
  }
}
