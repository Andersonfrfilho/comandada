import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { CreateStockMovementUseCase } from '@/modules/products/application/use-cases/CreateStockMovementUseCase'

type Database = NodePgDatabase<typeof schema>

const createStockMovementSchema = z.object({
  ingredientId: z.string().uuid(),
  movementType: z.enum(['adjustment', 'loss']),
  direction: z.enum(['increase', 'decrease']).optional(),
  quantity: z.number().positive(),
  reason: z.string().min(1).max(255),
})

export class StockMovementController {
  constructor(
    private readonly db: Database,
    private readonly createStockMovementUseCase: CreateStockMovementUseCase
  ) {}

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId, id: userId } = request.user

    const parsed = createStockMovementSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    if (parsed.data.movementType === 'adjustment' && !parsed.data.direction) {
      throw new ValidationError('direction é obrigatório para movementType adjustment')
    }

    const movement = await this.createStockMovementUseCase.execute({
      establishmentId,
      ingredientId: parsed.data.ingredientId,
      movementType: parsed.data.movementType,
      direction: parsed.data.direction ?? 'decrease',
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      userId,
    })

    response.json(movement, 201)
  }

  listByIngredient: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const ingredientId = (request as { query?: Record<string, string> }).query?.['ingredientId']
    if (!ingredientId) throw new ValidationError('Parâmetro ingredientId é obrigatório')

    const movements = await this.db
      .select({
        id: schema.stockMovements.id,
        movementType: schema.stockMovements.movementType,
        quantity: schema.stockMovements.quantity,
        reason: schema.stockMovements.reason,
        userName: schema.users.name,
        orderId: schema.stockMovements.orderId,
        createdAt: schema.stockMovements.createdAt,
      })
      .from(schema.stockMovements)
      .leftJoin(schema.users, eq(schema.stockMovements.userId, schema.users.id))
      .where(
        and(
          eq(schema.stockMovements.establishmentId, establishmentId),
          eq(schema.stockMovements.ingredientId, ingredientId)
        )
      )
      .orderBy(desc(schema.stockMovements.createdAt))
      .limit(50)

    response.json(movements)
  }
}
