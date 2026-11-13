import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { NotFoundError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

export interface CreateStockBatchInput {
  establishmentId: string
  ingredientId: string
  batchNumber: string
  quantity: number
  costPerUnit: number
  expiresAt: Date
  userId?: string
}

export interface CreateStockBatchResult {
  id: string
  ingredientId: string
  batchNumber: string
  quantity: string
  remainingQuantity: string
  costPerUnit: string
  expiresAt: Date
}

// Custo médio ponderado sobre o saldo total: uma entrada mais barata ou mais cara move o custo do
// ingrediente na direção certa sem descartar o histórico dos lotes anteriores. `costPerUnit` do
// ingrediente é o que a ficha técnica usa para estimar o custo do produto — errar aqui contamina
// toda margem exibida no catálogo.
function weightedAverageCost(
  currentQuantity: number,
  currentCost: number,
  incomingQuantity: number,
  incomingCost: number
): number {
  const totalQuantity = currentQuantity + incomingQuantity
  if (totalQuantity === 0) return incomingCost
  return (currentQuantity * currentCost + incomingQuantity * incomingCost) / totalQuantity
}

export class CreateStockBatchUseCase {
  constructor(
    private readonly db: Database,
    private readonly createAuditLogUseCase: CreateAuditLogUseCase
  ) {}

  async execute(input: CreateStockBatchInput): Promise<CreateStockBatchResult> {
    const ingredient = await this.db.query.ingredients.findFirst({
      where: and(
        eq(schema.ingredients.id, input.ingredientId),
        eq(schema.ingredients.establishmentId, input.establishmentId)
      ),
    })
    if (!ingredient) throw new NotFoundError('Ingrediente')

    const currentQuantity = Number(ingredient.stockQuantity)
    const currentCost = Number(ingredient.costPerUnit)
    const newCost = weightedAverageCost(currentQuantity, currentCost, input.quantity, input.costPerUnit)

    const batch = await this.db.transaction(async (tx) => {
      const [insertedBatch] = await tx
        .insert(schema.stockBatches)
        .values({
          establishmentId: input.establishmentId,
          ingredientId: input.ingredientId,
          batchNumber: input.batchNumber,
          quantity: String(input.quantity),
          remainingQuantity: String(input.quantity),
          costPerUnit: String(input.costPerUnit),
          expiresAt: input.expiresAt,
        })
        .returning()

      await tx.insert(schema.stockMovements).values({
        establishmentId: input.establishmentId,
        ingredientId: input.ingredientId,
        batchId: insertedBatch!.id,
        movementType: 'in',
        quantity: String(input.quantity),
        reason: `Entrada de lote ${input.batchNumber}`,
        ...(input.userId ? { userId: input.userId } : {}),
      })

      await tx
        .update(schema.ingredients)
        .set({
          stockQuantity: String(currentQuantity + input.quantity),
          costPerUnit: String(newCost),
          updatedAt: new Date(),
        })
        .where(eq(schema.ingredients.id, input.ingredientId))

      return insertedBatch!
    })

    await this.createAuditLogUseCase.execute({
      establishmentId: input.establishmentId,
      ...(input.userId ? { userId: input.userId } : {}),
      action: 'stock_batch.created',
      resourceType: 'stock_batch',
      resourceId: batch.id,
      metadata: {
        ingredientId: input.ingredientId,
        batchNumber: input.batchNumber,
        quantity: input.quantity,
        costPerUnit: input.costPerUnit,
      },
    })

    return {
      id: batch.id,
      ingredientId: batch.ingredientId,
      batchNumber: batch.batchNumber,
      quantity: batch.quantity,
      remainingQuantity: batch.remainingQuantity,
      costPerUnit: batch.costPerUnit,
      expiresAt: batch.expiresAt,
    }
  }
}
