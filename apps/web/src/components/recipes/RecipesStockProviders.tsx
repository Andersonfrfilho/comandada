import type { ReactNode } from 'react'
import '@adatechnology/recipes-ui/styles.css'
import '@adatechnology/stock-ui/styles.css'
import { RecipesProvider } from '@adatechnology/recipes-ui'
import { StockProvider } from '@adatechnology/stock-ui'

import { RecipesSelectField } from '@/components/recipes/RecipesSelectField'
import { recipesSdkApi } from '@/lib/recipesSdkApi'
import { stockSdkApi } from '@/lib/stockSdkApi'

type RecipesStockProvidersProps = {
  readonly children: ReactNode
}

// Os provedores só guardam contexto. Quem decide se uma tela de estoque aparece é `useStockEnabled`:
// montar e desmontar o provedor ao saber a resposta recarregaria a página inteira.
export function RecipesStockProviders({ children }: RecipesStockProvidersProps) {
  return (
    <RecipesProvider api={recipesSdkApi} locale="pt-BR" renderSelect={RecipesSelectField}>
      <StockProvider api={stockSdkApi}>{children}</StockProvider>
    </RecipesProvider>
  )
}
