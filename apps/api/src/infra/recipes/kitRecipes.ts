import { add, divide, formatDecimal, fromInteger, multiply, parseDecimal, type Rational, type Recipe, type RecipeLine, type RecipeUnit } from '@adatechnology/recipe-contracts'

export type KitComponent = {
  readonly kitProductId: string
  readonly componentProductId: string
  readonly quantity: number
}

type BuildKitRecipesParams = {
  readonly companyId: string
  readonly components: readonly KitComponent[]
  readonly recipesByProductId: ReadonlyMap<string, Recipe>
}

const KIT_YIELD_PORTIONS = '1'

type AggregatedLine = { readonly ingredientId: string; readonly unit: RecipeUnit; quantity: Rational }

function aggregateComponentLines(components: readonly KitComponent[], recipesByProductId: ReadonlyMap<string, Recipe>): AggregatedLine[] {
  const aggregated = new Map<string, AggregatedLine>()
  for (const component of components) {
    const componentRecipe = recipesByProductId.get(component.componentProductId)
    if (!componentRecipe) continue
    const portionsFactor = divide(fromInteger(component.quantity), parseDecimal(componentRecipe.yieldPortions))
    for (const line of componentRecipe.lines) {
      const key = `${line.ingredientId}:${line.unit}`
      const lineQuantity = multiply(parseDecimal(line.quantity), portionsFactor)
      const existing = aggregated.get(key)
      if (existing) existing.quantity = add(existing.quantity, lineQuantity)
      else aggregated.set(key, { ingredientId: line.ingredientId, unit: line.unit, quantity: lineQuantity })
    }
  }
  return [...aggregated.values()]
}

/**
 * Combo não tem ficha própria: vira uma ficha de rendimento 1 com os insumos dos componentes somados,
 * para o pedido baixar uma vez por item (chave `order:<pedido>:<item>`), como no módulo de estoque.
 */
export function buildKitRecipes(params: BuildKitRecipesParams): Recipe[] {
  const componentsByKit = new Map<string, KitComponent[]>()
  for (const component of params.components) {
    componentsByKit.set(component.kitProductId, [...(componentsByKit.get(component.kitProductId) ?? []), component])
  }
  const now = new Date().toISOString()
  const kitRecipes: Recipe[] = []
  for (const [kitProductId, kitComponents] of componentsByKit) {
    const lines: RecipeLine[] = aggregateComponentLines(kitComponents, params.recipesByProductId).map((line, position) => ({
      id: `${kitProductId}:${line.ingredientId}:${line.unit}`,
      ingredientId: line.ingredientId,
      quantity: formatDecimal(line.quantity),
      unit: line.unit,
      notes: null,
      position,
    }))
    if (lines.length === 0) continue
    kitRecipes.push({
      id: kitProductId,
      companyId: params.companyId,
      productId: kitProductId,
      yieldPortions: KIT_YIELD_PORTIONS,
      preparationTimeMinutes: null,
      instructions: '',
      lines,
      createdAt: now,
      updatedAt: now,
    })
  }
  return kitRecipes
}
