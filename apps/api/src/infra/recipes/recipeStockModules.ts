import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { createRecipeModule, type RecipeModule } from '@adatechnology/recipe-module'
import { createStockModule, type StockModule } from '@adatechnology/stock-module'

import { db } from '@/infra/database/connection'
import * as schema from '@/infra/database/schema'
import { createKitExpandingRecipeSource } from './kitRecipeSource'
import { createPreparationMirrorHooks } from './preparationMirror'
import { isStockEnabledForCompany } from './stockEnabled'
import { DEFAULT_EXPIRY_ALERT_DAYS, createStockExpiryHooks } from './stockExpiry'

type Database = NodePgDatabase<typeof schema>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RecipeStockModules = {
  readonly recipeModule: RecipeModule
  readonly stockModule: StockModule
}

type CreateRecipeStockModulesParams = {
  readonly database: Database
  readonly isStockEnabled: (companyId: string) => boolean | Promise<boolean>
}

async function findExistingProductIds(
  database: Database,
  params: { readonly companyId: string; readonly productIds: readonly string[] }
): Promise<readonly string[]> {
  const validIds = params.productIds.filter((productId) => UUID_PATTERN.test(productId))
  if (validIds.length === 0) return []
  const rows = await database
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(and(eq(schema.products.establishmentId, params.companyId), inArray(schema.products.id, validIds)))
  return rows.map((row) => row.id)
}

// Os dois módulos se referem: a ficha lê o saldo só na hora da chamada, então a referência tardia basta.
export function createRecipeStockModules(params: CreateRecipeStockModulesParams): RecipeStockModules {
  const { database } = params
  const recipeModule: RecipeModule = createRecipeModule({
    db: database,
    providers: {
      productReference: { findExisting: (query) => findExistingProductIds(database, query) },
      stockLevels: { getLevels: (query) => stockModule.useCases.getLevels.getLevels(query) },
    },
    hooks: createPreparationMirrorHooks(database),
  })

  const stockModule: StockModule = createStockModule({
    db: database,
    config: { isEnabledForCompany: params.isStockEnabled, expiryAlertDays: DEFAULT_EXPIRY_ALERT_DAYS },
    providers: {
      catalog: { findIngredients: (query) => recipeModule.useCases.findIngredients.execute(query) },
      recipes: createKitExpandingRecipeSource({ database, lookupRecipes: (query) => recipeModule.useCases.lookupRecipes.execute(query) }),
    },
    hooks: createStockExpiryHooks(database),
  })

  return { recipeModule, stockModule }
}

const modules = createRecipeStockModules({ database: db, isStockEnabled: isStockEnabledForCompany })

export const recipeModule: RecipeModule = modules.recipeModule
export const stockModule: StockModule = modules.stockModule
