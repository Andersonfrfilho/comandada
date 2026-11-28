import { and, eq, inArray } from 'drizzle-orm'
import { createRecipeModule, type RecipeModule } from '@adatechnology/recipe-module'
import { createStockModule, type StockModule } from '@adatechnology/stock-module'

import { db } from '@/infra/database/connection'
import * as schema from '@/infra/database/schema'
import { isStockEnabledForCompany } from './stockEnabled'

const DEFAULT_EXPIRY_ALERT_DAYS = 7
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findExistingProductIds(params: {
  readonly companyId: string
  readonly productIds: readonly string[]
}): Promise<readonly string[]> {
  const validIds = params.productIds.filter((productId) => UUID_PATTERN.test(productId))
  if (validIds.length === 0) return []
  const rows = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(and(eq(schema.products.establishmentId, params.companyId), inArray(schema.products.id, validIds)))
  return rows.map((row) => row.id)
}

// Os dois módulos se referem: a ficha lê o saldo só na hora da chamada, então a referência tardia basta.
export const recipeModule: RecipeModule = createRecipeModule({
  db,
  providers: {
    productReference: { findExisting: findExistingProductIds },
    stockLevels: { getLevels: (params) => stockModule.useCases.getLevels.getLevels(params) },
  },
})

export const stockModule: StockModule = createStockModule({
  db,
  config: {
    isEnabledForCompany: isStockEnabledForCompany,
    expiryAlertDays: DEFAULT_EXPIRY_ALERT_DAYS,
  },
  providers: {
    catalog: { findIngredients: (params) => recipeModule.useCases.findIngredients.execute(params) },
    recipes: { lookup: (params) => recipeModule.useCases.lookupRecipes.execute(params) },
  },
})
