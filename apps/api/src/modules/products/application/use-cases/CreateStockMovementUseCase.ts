import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { NotFoundError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

export type StockMovementType = 'adjustment' | 'loss'
export type StockMovementDirection = 'increase' | 'decrease'

export interface CreateStockMovementInput {
  establishmentId: string
  ingredientId: string
  movementType: StockMovementType
  direction: StockMovementDirection
  quantity: number
  reason: string
  userId?: string
}

export interface CreateStockMovementResult {
  id: string
  ingredientId: string
  movementType: string
  quantity: string
  reason: string | null
  stockQuantityAfter: string
}

export class CreateStockMovementUseCase {
  constructor(
    private readonly db: Database,
    private readonly createAuditLogUseCase: CreateAuditLogUseCase
  ) {}

  async execute(input: CreateStockMovementInput): Promise<CreateStockMovementResult> {
    const ingredient = await this.db.query.ingredients.findFirst({
      where: and(
        eq(schema.ingredients.id, input.ingredientId),
        eq(schema.ingredients.establishmentId, input.establishmentId)
      ),
    })
    if (!ingredient) throw new NotFoundError('Ingrediente')

    // Perda só reduz saldo; ajuste é bidirecional (recontagem pode subir ou descer).
    const effectiveDirection: StockMovementDirection = input.movementType === 'loss' ? 'decrease' : input.direction
    const signedQuantity = effectiveDirection === 'increase' ? input.quantity : -input.quantity
    const stockQuantityAfter = Number(ingredient.stockQuantity) + signedQuantity

    const movement = await this.db.transaction(async (tx) => {
      const [insertedMovement] = await tx
        .insert(schema.stockMovements)
        .values({
          establishmentId: input.establishmentId,
          ingredientId: input.ingredientId,
          movementType: input.movementType,
          quantity: String(signedQuantity),
          reason: input.reason,
          ...(input.userId ? { userId: input.userId } : {}),
        })
        .returning()

      await tx
        .update(schema.ingredients)
        .set({
          stockQuantity: String(stockQuantityAfter),
          updatedAt: new Date(),
        })
        .where(eq(schema.ingredients.id, input.ingredientId))

      return insertedMovement!
    })

    await this.createAuditLogUseCase.execute({
      establishmentId: input.establishmentId,
      ...(input.userId ? { userId: input.userId } : {}),
      action: 'stock_movement.created',
      resourceType: 'stock_movement',
      resourceId: movement.id,
      metadata: {
        ingredientId: input.ingredientId,
        movementType: input.movementType,
        direction: effectiveDirection,
        quantity: input.quantity,
        reason: input.reason,
      },
    })

    return {
      id: movement.id,
      ingredientId: movement.ingredientId,
      movementType: movement.movementType,
      quantity: movement.quantity,
      reason: movement.reason,
      stockQuantityAfter: String(stockQuantityAfter),
    }
  }
}
