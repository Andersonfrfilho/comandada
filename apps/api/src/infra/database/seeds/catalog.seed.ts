import { db } from '../connection'
import * as schema from '../schema'
import { CreateStockBatchUseCase } from '@/modules/products/application/use-cases/CreateStockBatchUseCase'
import { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'

function catalogId(index: number): string {
  return `00000000-0000-0000-000e-${String(index).padStart(12, '0')}`
}

function sectionId(index: number): string {
  return `00000000-0000-0000-000f-${String(index).padStart(12, '0')}`
}

function productId(index: number): string {
  return `00000000-0000-0000-0010-${String(index).padStart(12, '0')}`
}

function ingredientId(index: number): string {
  return `00000000-0000-0000-0011-${String(index).padStart(12, '0')}`
}

function productIngredientId(index: number): string {
  return `00000000-0000-0000-0012-${String(index).padStart(12, '0')}`
}

const CATALOGS = [
  { name: 'Comidas', slug: 'comidas' },
  { name: 'Bebidas', slug: 'bebidas' },
]

const SECTIONS = [
  { name: 'Pratos principais', description: 'Pratos servidos no prato ou marmita' },
  { name: 'Sobremesas', description: 'Doces e sobremesas' },
  { name: 'Bebidas', description: 'Sucos, refrigerantes e água' },
]

type ProductBlueprint = {
  catalogIndex: number
  sectionIndex: number
  name: string
  slug: string
  description: string
  price: number
  costPrice: number
  preparationTimeMinutes: number
  unit: string
}

// Sem `costPrice` os relatórios de lucro tratam todo prato como margem de 100%
// e o aviso de ficha técnica pendente aparece para o catálogo inteiro. As
// margens abaixo são deliberadamente diferentes entre si, para que o ranking
// de melhor margem tenha o que ordenar.
const PRODUCTS: ProductBlueprint[] = [
  { catalogIndex: 0, sectionIndex: 0, name: 'Marmita Executiva', slug: 'marmita-executiva', description: 'Arroz, feijão, frango grelhado e salada', price: 24.9, costPrice: 11.2, preparationTimeMinutes: 14, unit: 'un' },
  { catalogIndex: 0, sectionIndex: 0, name: 'Prato Feito Carne', slug: 'prato-feito-carne', description: 'Arroz, feijão, bife acebolado e farofa', price: 26.9, costPrice: 14.6, preparationTimeMinutes: 18, unit: 'un' },
  { catalogIndex: 0, sectionIndex: 1, name: 'Pudim de Leite', slug: 'pudim-de-leite', description: 'Fatia de pudim caseiro', price: 8.5, costPrice: 2.4, preparationTimeMinutes: 3, unit: 'un' },
  { catalogIndex: 1, sectionIndex: 2, name: 'Suco Natural Laranja', slug: 'suco-natural-laranja', description: 'Copo 500ml', price: 7.0, costPrice: 2.1, preparationTimeMinutes: 4, unit: 'un' },
  { catalogIndex: 1, sectionIndex: 2, name: 'Refrigerante Lata', slug: 'refrigerante-lata', description: 'Lata 350ml', price: 6.0, costPrice: 3.3, preparationTimeMinutes: 1, unit: 'un' },
]

type IngredientBlueprint = {
  name: string
  unit: 'un' | 'kg' | 'g' | 'l' | 'ml'
  minimumStock: number
  initialBatchQuantity: number
  initialBatchCost: number
}

const INGREDIENTS: IngredientBlueprint[] = [
  { name: 'Arroz', unit: 'kg', minimumStock: 5, initialBatchQuantity: 20, initialBatchCost: 6.5 },
  { name: 'Feijão', unit: 'kg', minimumStock: 5, initialBatchQuantity: 15, initialBatchCost: 8.0 },
  { name: 'Peito de frango', unit: 'kg', minimumStock: 4, initialBatchQuantity: 10, initialBatchCost: 18.0 },
  { name: 'Laranja', unit: 'kg', minimumStock: 3, initialBatchQuantity: 12, initialBatchCost: 4.5 },
]

// productIndex referencia PRODUCTS, ingredientIndex referencia INGREDIENTS
const RECIPES: Array<{ productIndex: number; ingredientIndex: number; quantity: number; unit: 'un' | 'kg' | 'g' | 'l' | 'ml' }> = [
  { productIndex: 0, ingredientIndex: 0, quantity: 0.15, unit: 'kg' },
  { productIndex: 0, ingredientIndex: 1, quantity: 0.1, unit: 'kg' },
  { productIndex: 0, ingredientIndex: 2, quantity: 0.2, unit: 'kg' },
  { productIndex: 3, ingredientIndex: 3, quantity: 0.3, unit: 'kg' },
]

export interface CatalogSeedResult {
  productIds: string[]
  ingredientIds: string[]
}

export async function seedCatalog(establishmentId: string): Promise<CatalogSeedResult> {
  const catalogs = CATALOGS.map((catalog, index) => ({
    id: catalogId(index),
    establishmentId,
    name: catalog.name,
    slug: catalog.slug,
  }))
  await db.insert(schema.catalogs).values(catalogs).onConflictDoNothing()

  const sections = SECTIONS.map((section, index) => ({
    id: sectionId(index),
    establishmentId,
    name: section.name,
    description: section.description,
  }))
  await db.insert(schema.sections).values(sections).onConflictDoNothing()

  const products = PRODUCTS.map((product, index) => ({
    id: productId(index),
    establishmentId,
    catalogId: catalogId(product.catalogIndex),
    sectionId: sectionId(product.sectionIndex),
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: String(product.price),
    costPrice: String(product.costPrice),
    preparationTimeMinutes: product.preparationTimeMinutes,
    unit: product.unit,
  }))
  await db.insert(schema.products).values(products).onConflictDoNothing()

  const ingredients = INGREDIENTS.map((ingredient, index) => ({
    id: ingredientId(index),
    establishmentId,
    name: ingredient.name,
    unit: ingredient.unit,
    minimumStock: String(ingredient.minimumStock),
  }))
  await db.insert(schema.ingredients).values(ingredients).onConflictDoNothing()

  const productIngredients = RECIPES.map((recipe, index) => ({
    id: productIngredientId(index),
    productId: productId(recipe.productIndex),
    ingredientId: ingredientId(recipe.ingredientIndex),
    quantity: String(recipe.quantity),
    unit: recipe.unit,
  }))
  await db.insert(schema.productIngredients).values(productIngredients).onConflictDoNothing()

  // Entrada de estoque via use-case: reaproveita a mesma lógica de custo médio ponderado
  // que a rota POST /stock-batches usa em produção, em vez de INSERT bruto.
  const createAuditLogUseCase = new CreateAuditLogUseCase(db)
  const createStockBatchUseCase = new CreateStockBatchUseCase(db, createAuditLogUseCase)

  for (const [index, ingredient] of INGREDIENTS.entries()) {
    const alreadyHasBatch = await db.query.stockBatches.findFirst({
      where: (batches, { eq, and }) => and(eq(batches.ingredientId, ingredientId(index)), eq(batches.establishmentId, establishmentId)),
    })
    if (alreadyHasBatch) continue

    await createStockBatchUseCase.execute({
      establishmentId,
      ingredientId: ingredientId(index),
      batchNumber: `SEED-${String(index).padStart(3, '0')}`,
      quantity: ingredient.initialBatchQuantity,
      costPerUnit: ingredient.initialBatchCost,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
  }

  return {
    productIds: products.map((product) => product.id),
    ingredientIds: ingredients.map((ingredient) => ingredient.id),
  }
}
