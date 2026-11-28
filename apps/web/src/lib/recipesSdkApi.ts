/**
 * Implementação do contrato `RecipesApi` do @adatechnology/recipes-ui sobre as rotas do
 * `recipe-module` (`/sdk/recipes`). O 404 da ficha de um produto sem ficha vira `null`.
 */

import type { RecipeCost } from '@adatechnology/recipe-contracts'
import type { RecipesApi } from '@adatechnology/recipes-ui'

import { ApiError, api } from '@/lib/api'
import { SDK_PATH, accessToken, buildQuery, sdkDelete, sdkGet, sdkPatch, sdkPost, sdkPut } from '@/lib/sdkHttp'

const NOT_FOUND_STATUS = 404

type IngredientFilters = Parameters<NonNullable<RecipesApi['exportIngredients']>>[0]['filters']

type RecipeCostsResult = {
  readonly costs: readonly RecipeCost[]
  readonly productsWithoutRecipe: readonly string[]
}

export type RecipeCostProduct = {
  readonly productId: string
  readonly salePriceCents: number
}

function filtersQuery(filters: IngredientFilters) {
  return {
    search: filters.search || undefined,
    unit: filters.units && filters.units.length > 0 ? filters.units.join(',') : undefined,
    sort: filters.sort,
    order: filters.order,
  }
}

function recipePath(productId: string): string {
  return `${SDK_PATH.RECIPES}/recipes/${encodeURIComponent(productId)}`
}

export const recipesSdkApi: RecipesApi = {
  listIngredients: (params) =>
    sdkGet(
      `${SDK_PATH.RECIPES}/ingredients${buildQuery({ page: params.page, pageSize: params.pageSize, ...filtersQuery(params) })}`
    ),
  createIngredient: (input) => sdkPost(`${SDK_PATH.RECIPES}/ingredients`, input),
  updateIngredient: (id, input) => sdkPatch(`${SDK_PATH.RECIPES}/ingredients/${id}`, input),
  removeIngredient: (id) => sdkDelete(`${SDK_PATH.RECIPES}/ingredients/${id}`),
  exportIngredients: ({ filters, format }) =>
    api.getBlob(`${SDK_PATH.RECIPES}/ingredients/export${buildQuery({ ...filtersQuery(filters), format })}`, accessToken()),
  async getRecipe(productId, options) {
    try {
      return await sdkGet(`${recipePath(productId)}${buildQuery({ salePriceCents: options?.salePriceCents })}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === NOT_FOUND_STATUS) return null
      throw error
    }
  },
  saveRecipe: (productId, input, options) =>
    sdkPut(`${recipePath(productId)}${buildQuery({ salePriceCents: options?.salePriceCents })}`, input),
  removeRecipe: (productId) => sdkDelete(recipePath(productId)),
  buildShoppingList: (items) => sdkPost(`${SDK_PATH.RECIPES}/shopping-lists`, { items }),
  exportShoppingList: (items, format) =>
    api.postBlob(`${SDK_PATH.RECIPES}/shopping-lists/export`, { items, format }, accessToken()),
}

/** Uma chamada para o custo de todos os produtos da página (não uma por produto). */
export function fetchRecipeCosts(products: readonly RecipeCostProduct[]): Promise<RecipeCostsResult> {
  return sdkPost(`${SDK_PATH.RECIPES}/recipe-costs`, { products })
}
