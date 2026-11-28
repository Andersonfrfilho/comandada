import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RecipeModule } from '@adatechnology/recipe-module'
import { batches, type StockModule } from '@adatechnology/stock-module'

import * as schema from '@/infra/database/schema'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { toLegacyStockBatch, type LegacyStockBatch } from '../../shared/legacyStockShapes'

type Database = NodePgDatabase<typeof schema>

const DECIMAL_SCALE = 4

export type CreateStockBatchDependencies = {
  readonly db: Database
  readonly recipes: RecipeModule
  readonly stock: StockModule
  readonly createAuditLogUseCase: CreateAuditLogUseCase
  readonly ensureStockEnabled: (establishmentId: string) => Promise<void>
}

export interface CreateStockBatchInput {
  establishmentId: string
  ingredientId: string
  batchNumber: string
  quantity: number
  costPerUnit: number
  expiresAt: Date
  userId?: string
}

// Custo médio ponderado sobre o saldo total: o `costPerUnit` do insumo é o que a ficha usa para estimar
// o custo do produto, então uma entrada mais cara ou mais barata tem de mover esse custo. Saldo negativo conta como zero.
function weightedAverageCost(params: {
  readonly currentQuantity: number
  readonly currentCost: number
  readonly incomingQuantity: number
  readonly incomingCost: number
}): number {
  const currentQuantity = Math.max(params.currentQuantity, 0)
  const totalQuantity = currentQuantity + params.incomingQuantity
  if (totalQuantity === 0) return params.incomingCost
  return (currentQuantity * params.currentCost + params.incomingQuantity * params.incomingCost) / totalQuantity
}

/** Entrada de lote pelo painel antigo: o módulo de estoque recebe o lote; o custo médio do insumo segue aqui. */
export class CreateStockBatchUseCase {
  private readonly db: Database
  private readonly recipes: RecipeModule
  private readonly stock: StockModule
  private readonly createAuditLogUseCase: CreateAuditLogUseCase
  private readonly ensureStockEnabled: (establishmentId: string) => Promise<void>

  constructor(dependencies: CreateStockBatchDependencies) {
    this.db = dependencies.db
    this.recipes = dependencies.recipes
    this.stock = dependencies.stock
    this.createAuditLogUseCase = dependencies.createAuditLogUseCase
    this.ensureStockEnabled = dependencies.ensureStockEnabled
  }

  async execute(input: CreateStockBatchInput): Promise<LegacyStockBatch> {
    const { establishmentId, ingredientId } = input
    const actor = input.userId ? { actorId: input.userId } : {}

    const ingredient = await this.recipes.useCases.getIngredient.execute({ companyId: establishmentId, id: ingredientId })
    await this.ensureStockEnabled(establishmentId)
    const levelBefore = await this.stock.useCases.getLevel.execute({ companyId: establishmentId, ingredientId })

    await this.stock.useCases.receiveBatch.execute({
      companyId: establishmentId,
      ...actor,
      input: {
        ingredientId,
        quantity: input.quantity.toFixed(DECIMAL_SCALE),
        batchCode: input.batchNumber,
        costPerUnit: input.costPerUnit.toFixed(DECIMAL_SCALE),
        expiresAt: input.expiresAt.toISOString(),
        reason: `Entrada de lote ${input.batchNumber}`,
      },
    })

    const newCost = weightedAverageCost({
      currentQuantity: Number(levelBefore.quantity),
      currentCost: Number(ingredient.costPerUnit),
      incomingQuantity: input.quantity,
      incomingCost: input.costPerUnit,
    })
    await this.recipes.useCases.updateIngredient.execute({
      companyId: establishmentId,
      ...actor,
      id: ingredientId,
      input: { costPerUnit: newCost.toFixed(DECIMAL_SCALE) },
    })

    const [batch] = await this.db
      .select()
      .from(batches)
      .where(and(eq(batches.companyId, establishmentId), eq(batches.ingredientId, ingredientId), eq(batches.batchCode, input.batchNumber)))
      .orderBy(desc(batches.receivedAt))
      .limit(1)

    await this.createAuditLogUseCase.execute({
      establishmentId,
      ...actor,
      action: 'stock_batch.created',
      resourceType: 'stock_batch',
      resourceId: batch!.id,
      metadata: {
        ingredientId,
        batchNumber: input.batchNumber,
        quantity: input.quantity,
        costPerUnit: input.costPerUnit,
      },
    })

    return toLegacyStockBatch(batch!)
  }
}
