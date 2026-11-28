import { useQueryClient } from '@tanstack/react-query'
import { RecipeEditor } from '@adatechnology/recipes-ui'

import { RECIPE_COSTS_QUERY_KEY } from '@/hooks/useRecipeCosts'
import { PRODUCT_STOCK_QUERY_KEY } from './ProductStockCard'
import { invalidateCatalogQueries } from '../catalogShared'

type ProductRecipeEditorProps = {
  readonly productId: string
  readonly productName: string
  /** Preço de venda atual, em reais, como a API do catálogo devolve. */
  readonly price: string
}

/** Ficha técnica do produto: dona do tempo e do modo de preparo, que a API espelha em `products`. */
export function ProductRecipeEditor({ productId, productName, price }: ProductRecipeEditorProps) {
  const queryClient = useQueryClient()

  function handleSaved(): void {
    void queryClient.invalidateQueries({ queryKey: [RECIPE_COSTS_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: [PRODUCT_STOCK_QUERY_KEY, productId] })
    invalidateCatalogQueries(queryClient)
  }

  return (
    <RecipeEditor
      productId={productId}
      productName={productName}
      salePriceCents={Math.round(Number(price) * 100)}
      onSaved={handleSaved}
    />
  )
}
