import { and, asc, eq, gt, lte } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import { batches } from '@adatechnology/stock-module'
import type { RecipeModule } from '@adatechnology/recipe-module'
import * as schema from '@/infra/database/schema'
import { findExpiryAlertDays } from '@/infra/recipes/stockExpiry'
import { toLegacyStockBatch } from '../../shared/legacyStockShapes'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { CreateStockBatchUseCase } from '@/modules/products/application/use-cases/CreateStockBatchUseCase'

type Database = NodePgDatabase<typeof schema>

const DEFAULT_EXPIRY_ALERT_DAYS = 7
const MAX_EXPIRY_DAYS = 365
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

const createStockBatchSchema = z.object({
  ingredientId: z.string().uuid(),
  batchNumber: z.string().min(1).max(100),
  quantity: z.number().positive(),
  costPerUnit: z.number().min(0),
  expiresAt: z.coerce.date(),
})

export class StockBatchController {
  constructor(
    private readonly db: Database,
    private readonly createStockBatchUseCase: CreateStockBatchUseCase,
    private readonly recipes: RecipeModule
  ) {}

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId, id: userId } = request.user

    const parsed = createStockBatchSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const batch = await this.createStockBatchUseCase.execute({
      establishmentId,
      ingredientId: parsed.data.ingredientId,
      batchNumber: parsed.data.batchNumber,
      quantity: parsed.data.quantity,
      costPerUnit: parsed.data.costPerUnit,
      expiresAt: parsed.data.expiresAt,
      userId,
    })

    response.json(batch, 201)
  }

  listByIngredient: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const ingredientId = (request as { query?: Record<string, string> }).query?.['ingredientId']
    if (!ingredientId) throw new ValidationError('Parâmetro ingredientId é obrigatório')

    const rows = await this.db
      .select()
      .from(batches)
      .where(and(eq(batches.companyId, establishmentId), eq(batches.ingredientId, ingredientId)))
      .orderBy(asc(batches.expiresAt))

    response.json(rows.map(toLegacyStockBatch))
  }

  listExpiring: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const daysStr = (request as { query?: Record<string, string> }).query?.['days'] ?? String(DEFAULT_EXPIRY_ALERT_DAYS)
    const days = parseInt(daysStr, 10)
    if (isNaN(days) || days < 1) throw new ValidationError('Parâmetro days deve ser número positivo')

    const rows = await this.db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.companyId, establishmentId),
          lte(batches.expiresAt, new Date(Date.now() + Math.min(days, MAX_EXPIRY_DAYS) * DAY_IN_MILLISECONDS)),
          gt(batches.remainingQuantity, '0')
        )
      )
      .orderBy(asc(batches.expiresAt))

    const ingredients = await this.recipes.useCases.findIngredients.execute({
      companyId: establishmentId,
      ingredientIds: [...new Set(rows.map((row) => row.ingredientId))],
    })
    const nameById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]))

    response.json(
      rows.map((row) => {
        const batch = toLegacyStockBatch(row)
        return {
          id: batch.id,
          ingredientId: batch.ingredientId,
          ingredientName: nameById.get(batch.ingredientId) ?? null,
          batchNumber: batch.batchNumber,
          quantity: batch.quantity,
          remainingQuantity: batch.remainingQuantity,
          costPerUnit: batch.costPerUnit,
          expiresAt: batch.expiresAt,
          createdAt: batch.createdAt,
        }
      })
    )
  }

  countExpiring: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const alertDays = await findExpiryAlertDays(this.db, establishmentId)
    const rows = await this.db
      .select({ id: batches.id })
      .from(batches)
      .where(
        and(
          eq(batches.companyId, establishmentId),
          lte(batches.expiresAt, new Date(Date.now() + alertDays * DAY_IN_MILLISECONDS)),
          gt(batches.remainingQuantity, '0')
        )
      )

    response.json({ count: rows.length, alertDays })
  }
}
