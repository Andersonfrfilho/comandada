import type { ProductLookupProvider, ProductSuggestion } from './ProductLookupProvider'
import { productSuggestionSchema } from './ProductLookupProvider'
import { PRODUCT_LOOKUP_TIMEOUT_MS } from '@/shared/constants/productLookup.constant'

const SOURCE_NAME = 'openfoodfacts'
const SEARCH_PAGE_SIZE = 10

type OpenFoodFactsSearchProduct = {
  product_name?: string
  brands?: string
  code?: string
  image_url?: string
  categories?: string
}

type OpenFoodFactsSearchResponse = {
  products?: OpenFoodFactsSearchProduct[]
}

type OpenFoodFactsLookupResponse = {
  status?: number
  product?: OpenFoodFactsSearchProduct
}

export class OpenFoodFactsProvider implements ProductLookupProvider {
  readonly name = SOURCE_NAME

  // Devolve `null` quando o payload externo não passa no schema, em vez de propagar
  // um objeto meio válido para dentro do formulário.
  private toSuggestion(product: OpenFoodFactsSearchProduct): ProductSuggestion | null {
    const parsed = productSuggestionSchema.safeParse({
      name: product.product_name,
      source: SOURCE_NAME,
      ...(product.brands && { brand: product.brands }),
      ...(product.code && { barcode: product.code }),
      ...(product.image_url && { imageUrl: product.image_url }),
      ...(product.categories && { category: product.categories }),
    })
    return parsed.success ? parsed.data : null
  }

  private async fetchJson<TResponse>(url: string): Promise<TResponse | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(PRODUCT_LOOKUP_TIMEOUT_MS),
      })
      if (!response.ok) return null
      return (await response.json()) as TResponse
    } catch {
      // Degradação silenciosa: indisponibilidade de base externa não é erro do usuário.
      return null
    }
  }

  async search(query: string): Promise<readonly ProductSuggestion[]> {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=${SEARCH_PAGE_SIZE}&search_simple=1`

    const data = await this.fetchJson<OpenFoodFactsSearchResponse>(url)
    if (!data) return []

    return (data.products ?? [])
      .slice(0, SEARCH_PAGE_SIZE)
      .map((product) => this.toSuggestion(product))
      .filter((suggestion): suggestion is ProductSuggestion => suggestion !== null)
  }

  async getByBarcode(barcode: string): Promise<ProductSuggestion | null> {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`

    const data = await this.fetchJson<OpenFoodFactsLookupResponse>(url)
    if (!data || data.status !== 1 || !data.product) return null

    return this.toSuggestion(data.product)
  }
}
