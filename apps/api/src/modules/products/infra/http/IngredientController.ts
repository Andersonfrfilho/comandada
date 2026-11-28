import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { compare, parseDecimal, RecipeNotFoundError, type Ingredient, type Recipe, type RecipeUnit } from '@adatechnology/recipe-contracts'
import type { RecipeModule } from '@adatechnology/recipe-module'
import type { StockModule } from '@adatechnology/stock-module'
import type { StockLevelView } from '@adatechnology/stock-contracts'

import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError, ValidationError, NotFoundError, ConflictError } from '@/shared/errors/AppError'
import {
  MODULE_PAGE_SIZE,
  fetchAllPages,
  toLegacyIngredient,
  toLegacyProductIngredient,
  type LegacyIngredient,
} from '../../shared/legacyStockShapes'

type Database = NodePgDatabase<typeof schema>

const UNITS = ['un', 'kg', 'g', 'l', 'ml'] as const
const DECIMAL_SCALE = 4

const ingredientSchema = z.object({
  name: z.string().min(1).max(255),
  unit: z.enum(UNITS).optional(),
  costPerUnit: z.number().min(0).optional(),
  minimumStock: z.number().min(0).nullable().optional(),
  // Aceito para não quebrar o painel; a seção do insumo não existe nos módulos (decisão pendente com o dono).
  sectionId: z.string().uuid().nullable().optional(),
})

const recipeLineSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: z.enum(UNITS).optional(),
  notes: z.string().optional(),
})

export type IngredientControllerDependencies = {
  readonly db: Database
  readonly recipes: RecipeModule
  readonly stock: StockModule
  readonly ensureStockEnabled: (establishmentId: string) => Promise<void>
}

function toDecimalText(value: number): string {
  return value.toFixed(DECIMAL_SCALE)
}

/**
 * Rotas antigas de insumo e ficha como adaptador dos módulos `recipe-module` e `stock-module`:
 * o painel segue funcionando, agora sobre os dados novos, até trocar para `/sdk/*`.
 */
export class IngredientController {
  private readonly db: Database
  private readonly recipes: RecipeModule
  private readonly stock: StockModule
  private readonly ensureStockEnabled: (establishmentId: string) => Promise<void>

  constructor(dependencies: IngredientControllerDependencies) {
    this.db = dependencies.db
    this.recipes = dependencies.recipes
    this.stock = dependencies.stock
    this.ensureStockEnabled = dependencies.ensureStockEnabled
  }

  private async isStockEnabled(companyId: string): Promise<boolean> {
    return (await this.stock.config.isEnabledForCompany?.(companyId)) ?? true
  }

  private async readLevels(companyId: string): Promise<Map<string, StockLevelView>> {
    if (!(await this.isStockEnabled(companyId))) return new Map()
    const levels = await fetchAllPages((page) =>
      this.stock.useCases.listLevels.execute({ companyId, query: { page, pageSize: MODULE_PAGE_SIZE } })
    )
    return new Map(levels.map((level) => [level.ingredientId, level]))
  }

  private async listLegacyIngredients(companyId: string): Promise<LegacyIngredient[]> {
    const [ingredients, levels] = await Promise.all([
      fetchAllPages((page) =>
        this.recipes.useCases.listIngredients.execute({ companyId, query: { sort: 'name', order: 'asc', page, pageSize: MODULE_PAGE_SIZE } })
      ),
      this.readLevels(companyId),
    ])
    return ingredients.map((ingredient) => toLegacyIngredient({ ingredient, level: levels.get(ingredient.id) }))
  }

  private async readLegacyIngredient(params: { readonly companyId: string; readonly ingredient: Ingredient }): Promise<LegacyIngredient> {
    const level = (await this.isStockEnabled(params.companyId))
      ? await this.stock.useCases.getLevel.execute({ companyId: params.companyId, ingredientId: params.ingredient.id })
      : undefined
    return toLegacyIngredient({ ingredient: params.ingredient, level })
  }

  private async applyMinimumStock(params: { readonly companyId: string; readonly ingredientId: string; readonly minimumStock: number | null | undefined }): Promise<void> {
    if (params.minimumStock === undefined) return
    await this.ensureStockEnabled(params.companyId)
    await this.stock.useCases.setMinimum.execute({
      companyId: params.companyId,
      ingredientId: params.ingredientId,
      minimumQuantity: params.minimumStock === null ? null : toDecimalText(params.minimumStock),
    })
  }

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    response.json(await this.listLegacyIngredients(request.user.establishmentId))
  }

  // Igual ao antigo: `quantidade <= mínimo` (o módulo marca "abaixo" só com `<`).
  private async listLowStockIngredients(companyId: string): Promise<LegacyIngredient[]> {
    const ingredients = await this.listLegacyIngredients(companyId)
    return ingredients.filter(
      (ingredient) => ingredient.minimumStock !== null && compare(parseDecimal(ingredient.stockQuantity), parseDecimal(ingredient.minimumStock)) <= 0
    )
  }

  listLowStock: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    response.json(await this.listLowStockIngredients(request.user.establishmentId))
  }

  countLowStock: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const lowStock = await this.listLowStockIngredients(request.user.establishmentId)
    response.json({ count: lowStock.length })
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId, id: userId } = request.user

    const parsed = ingredientSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const ingredient = await this.recipes.useCases.createIngredient.execute({
      companyId: establishmentId,
      actorId: userId,
      input: {
        name: parsed.data.name,
        unit: parsed.data.unit ?? 'un',
        costPerUnit: toDecimalText(parsed.data.costPerUnit ?? 0),
        supplier: null,
        notes: null,
      },
    })
    await this.applyMinimumStock({ companyId: establishmentId, ingredientId: ingredient.id, minimumStock: parsed.data.minimumStock })

    response.json(await this.readLegacyIngredient({ companyId: establishmentId, ingredient }), 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId, id: userId } = request.user
    const id = request.params['id']!

    const parsed = ingredientSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const ingredient = await this.recipes.useCases.updateIngredient.execute({
      companyId: establishmentId,
      actorId: userId,
      id,
      input: {
        name: parsed.data.name,
        ...(parsed.data.unit !== undefined && { unit: parsed.data.unit }),
        ...(parsed.data.costPerUnit !== undefined && { costPerUnit: toDecimalText(parsed.data.costPerUnit) }),
      },
    })
    await this.applyMinimumStock({ companyId: establishmentId, ingredientId: id, minimumStock: parsed.data.minimumStock })

    response.json(await this.readLegacyIngredient({ companyId: establishmentId, ingredient }))
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId, id: userId } = request.user

    await this.recipes.useCases.removeIngredient.execute({ companyId: establishmentId, actorId: userId, id: request.params['id']! })

    response.json({ success: true }, 200)
  }

  // ── Ficha técnica do produto ─────────────────────────────────────────────

  private async assertProductExists(params: { readonly establishmentId: string; readonly productId: string }): Promise<void> {
    const product = await this.db.query.products.findFirst({
      where: and(eq(schema.products.id, params.productId), eq(schema.products.establishmentId, params.establishmentId)),
      columns: { id: true },
    })
    if (!product) throw new NotFoundError('Produto')
  }

  private async findRecipe(params: { readonly companyId: string; readonly productId: string }): Promise<Recipe | undefined> {
    try {
      return (await this.recipes.useCases.getRecipe.execute(params)).recipe
    } catch (error) {
      if (error instanceof RecipeNotFoundError) return undefined
      throw error
    }
  }

  private async saveRecipeLines(params: {
    readonly companyId: string
    readonly actorId: string
    readonly productId: string
    readonly current: Recipe | undefined
    readonly lines: readonly { readonly id?: string; readonly ingredientId: string; readonly quantity: string; readonly unit: RecipeUnit; readonly notes: string | null }[]
  }): Promise<Recipe> {
    const detail = await this.recipes.useCases.saveRecipe.execute({
      companyId: params.companyId,
      actorId: params.actorId,
      productId: params.productId,
      input: {
        yieldPortions: params.current?.yieldPortions ?? '1',
        preparationTimeMinutes: params.current?.preparationTimeMinutes ?? null,
        instructions: params.current?.instructions ?? '',
        lines: params.lines.map((line) => ({ ...line })),
      },
    })
    return detail.recipe
  }

  listByProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const productId = request.params['productId']!

    await this.assertProductExists({ establishmentId, productId })
    const recipe = await this.findRecipe({ companyId: establishmentId, productId })

    response.json((recipe?.lines ?? []).map((line) => toLegacyProductIngredient({ recipe: recipe!, line })))
  }

  private toLineInputs(recipe: Recipe | undefined) {
    return (recipe?.lines ?? []).map((line) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      quantity: line.quantity,
      unit: line.unit,
      notes: line.notes,
    }))
  }

  addToProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId, id: userId } = request.user
    const productId = request.params['productId']!

    const parsed = recipeLineSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    await this.assertProductExists({ establishmentId, productId })
    const current = await this.findRecipe({ companyId: establishmentId, productId })
    if (current?.lines.some((line) => line.ingredientId === parsed.data.ingredientId)) {
      throw new ConflictError('Ingrediente já adicionado à ficha técnica')
    }

    const ingredient = await this.recipes.useCases.getIngredient.execute({ companyId: establishmentId, id: parsed.data.ingredientId })
    const saved = await this.saveRecipeLines({
      companyId: establishmentId,
      actorId: userId,
      productId,
      current,
      lines: [
        ...this.toLineInputs(current),
        {
          ingredientId: parsed.data.ingredientId,
          quantity: toDecimalText(parsed.data.quantity),
          unit: parsed.data.unit ?? (ingredient.unit),
          notes: parsed.data.notes ?? null,
        },
      ],
    })

    const addedLine = saved.lines.find((line) => line.ingredientId === parsed.data.ingredientId)!
    response.json(toLegacyProductIngredient({ recipe: saved, line: addedLine }), 201)
  }

  removeFromProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId, id: userId } = request.user
    const productId = request.params['productId']!
    const id = request.params['id']!

    await this.assertProductExists({ establishmentId, productId })
    const current = await this.findRecipe({ companyId: establishmentId, productId })
    if (!current?.lines.some((line) => line.id === id)) throw new NotFoundError('Item da ficha técnica')

    await this.saveRecipeLines({
      companyId: establishmentId,
      actorId: userId,
      productId,
      current,
      lines: this.toLineInputs(current).filter((line) => line.id !== id),
    })

    response.json({ success: true }, 200)
  }
}
