import type { Ingredient, Paginated, Recipe, RecipeLine } from '@adatechnology/recipe-contracts'
import type { StockLevelView } from '@adatechnology/stock-contracts'
import type { BatchRow } from '@adatechnology/stock-module'

// Formatos que o painel atual lê das rotas antigas; a fase do painel troca por `/sdk/*` e estes somem.
export type LegacyIngredient = {
  readonly id: string
  readonly establishmentId: string
  readonly name: string
  readonly unit: string
  readonly costPerUnit: string
  readonly stockQuantity: string
  readonly minimumStock: string | null
  readonly sectionId: null
  readonly createdAt: string
  readonly updatedAt: string
}

export type LegacyProductIngredient = {
  readonly id: string
  readonly productId: string
  readonly ingredientId: string
  readonly quantity: string
  readonly unit: string
  readonly notes: string | null
}

export type LegacyStockBatch = {
  readonly id: string
  readonly establishmentId: string
  readonly ingredientId: string
  readonly batchNumber: string
  readonly quantity: string
  readonly remainingQuantity: string
  readonly costPerUnit: string | null
  readonly expiresAt: string | null
  readonly createdAt: string
}

const EMPTY_QUANTITY = '0'

export function toLegacyIngredient(params: {
  readonly ingredient: Ingredient
  readonly level: StockLevelView | undefined
}): LegacyIngredient {
  const { ingredient, level } = params
  return {
    id: ingredient.id,
    establishmentId: ingredient.companyId,
    name: ingredient.name,
    unit: ingredient.unit,
    costPerUnit: ingredient.costPerUnit,
    stockQuantity: level?.quantity ?? EMPTY_QUANTITY,
    minimumStock: level?.minimumQuantity ?? null,
    sectionId: null,
    createdAt: ingredient.createdAt,
    updatedAt: ingredient.updatedAt,
  }
}

export function toLegacyProductIngredient(params: { readonly recipe: Recipe; readonly line: RecipeLine }): LegacyProductIngredient {
  return {
    id: params.line.id,
    productId: params.recipe.productId,
    ingredientId: params.line.ingredientId,
    quantity: params.line.quantity,
    unit: params.line.unit,
    notes: params.line.notes,
  }
}

export function toLegacyStockBatch(batch: BatchRow): LegacyStockBatch {
  return {
    id: batch.id,
    establishmentId: batch.companyId,
    ingredientId: batch.ingredientId,
    batchNumber: batch.batchCode,
    quantity: batch.quantity,
    remainingQuantity: batch.remainingQuantity,
    costPerUnit: batch.costPerUnit,
    expiresAt: batch.expiresAt?.toISOString() ?? null,
    createdAt: batch.receivedAt.toISOString(),
  }
}

/** Percorre todas as páginas de uma listagem do módulo (as rotas antigas devolviam o conjunto inteiro). */
export async function fetchAllPages<TItem>(fetchPage: (page: number) => Promise<Paginated<TItem>>): Promise<TItem[]> {
  const first = await fetchPage(1)
  const remainingPages = Array.from({ length: Math.max(first.pagination.totalPages - 1, 0) }, (_, index) => fetchPage(index + 2))
  const others = await Promise.all(remainingPages)
  return [...first.data, ...others.flatMap((page) => page.data)]
}

export const MODULE_PAGE_SIZE = 100
