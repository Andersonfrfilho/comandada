import { useQuery } from '@tanstack/react-query'
import { RECIPE_LIMITS, type RecipeCost } from '@adatechnology/recipe-contracts'

import { fetchRecipeCosts, type RecipeCostProduct } from '@/lib/recipesSdkApi'
import { useAuthStore } from '@/stores/authStore'

export const RECIPE_COSTS_QUERY_KEY = 'sdk-recipe-costs'

type PricedProduct = {
  readonly id: string
  /** Preço de venda em reais, como a API do catálogo devolve. */
  readonly price: string
}

type RecipeCostLookup = {
  readonly costByProductId: ReadonlyMap<string, RecipeCost>
  readonly isLoading: boolean
}

const EMPTY_COSTS: ReadonlyMap<string, RecipeCost> = new Map()

function chunk<TItem>(items: readonly TItem[], size: number): TItem[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

async function loadCosts(products: readonly RecipeCostProduct[]): Promise<ReadonlyMap<string, RecipeCost>> {
  const batches = await Promise.all(chunk(products, RECIPE_LIMITS.BATCH_PRODUCTS).map(fetchRecipeCosts))
  return new Map(batches.flatMap((batch) => batch.costs).map((cost) => [cost.productId, cost]))
}

/** Custo e margem de todos os produtos da tela em uma chamada (500 por vez), não uma por produto. */
export function useRecipeCosts(products: readonly PricedProduct[]): RecipeCostLookup {
  const hasSession = useAuthStore((state) => state.accessToken !== null)
  const requested = products.map((product) => ({
    productId: product.id,
    salePriceCents: Math.round(Number(product.price) * 100),
  }))
  const signature = requested.map((product) => `${product.productId}:${product.salePriceCents}`).join('|')

  const { data, isLoading } = useQuery({
    queryKey: [RECIPE_COSTS_QUERY_KEY, signature],
    enabled: hasSession && requested.length > 0,
    queryFn: () => loadCosts(requested),
    staleTime: 30_000,
  })

  return { costByProductId: data ?? EMPTY_COSTS, isLoading }
}
