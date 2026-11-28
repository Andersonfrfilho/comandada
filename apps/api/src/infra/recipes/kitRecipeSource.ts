import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RecipeSourcePort } from '@adatechnology/stock-contracts'
import type { Recipe } from '@adatechnology/recipe-contracts'

import * as schema from '@/infra/database/schema'
import { buildKitRecipes } from './kitRecipes'

type Database = NodePgDatabase<typeof schema>
type LookupRecipes = (params: { readonly companyId: string; readonly productIds: readonly string[] }) => ReturnType<RecipeSourcePort['lookup']>

async function findKitComponents(database: Database, params: { readonly companyId: string; readonly productIds: readonly string[] }) {
  const kits = await database
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.establishmentId, params.companyId),
        inArray(schema.products.id, [...params.productIds]),
        eq(schema.products.isKit, true)
      )
    )
  if (kits.length === 0) return []
  return database
    .select({
      kitProductId: schema.productComponents.kitProductId,
      componentProductId: schema.productComponents.componentProductId,
      quantity: schema.productComponents.quantity,
    })
    .from(schema.productComponents)
    .where(inArray(schema.productComponents.kitProductId, kits.map((kit) => kit.id)))
}

/** Fichas da baixa por pedido: o combo (`is_kit`) vira a soma das fichas dos componentes, um nível só. */
export function createKitExpandingRecipeSource(params: { readonly database: Database; readonly lookupRecipes: LookupRecipes }): RecipeSourcePort {
  const { database, lookupRecipes } = params
  return {
    async lookup(params) {
      if (params.productIds.length === 0) return { recipes: [], ingredients: [] }
      const components = await findKitComponents(database, params)
      const componentProductIds = components.map((component) => component.componentProductId)
      const lookedUp = await lookupRecipes({ companyId: params.companyId, productIds: [...new Set([...params.productIds, ...componentProductIds])] })
      const recipesByProductId = new Map<string, Recipe>(lookedUp.recipes.map((recipe) => [recipe.productId, recipe]))
      const kitRecipes = buildKitRecipes({ companyId: params.companyId, components, recipesByProductId })
      const kitProductIds = new Set(components.map((component) => component.kitProductId))
      const plainRecipes = lookedUp.recipes.filter((recipe) => !kitProductIds.has(recipe.productId))
      return { recipes: [...plainRecipes, ...kitRecipes], ingredients: lookedUp.ingredients }
    },
  }
}
