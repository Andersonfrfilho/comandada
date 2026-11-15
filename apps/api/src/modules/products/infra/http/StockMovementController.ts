import { and, asc, count, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import { buildPageResult, parseAllowedList, parsePageRequest } from '@/shared/utils/listQuery'
import type { CreateStockMovementUseCase } from '@/modules/products/application/use-cases/CreateStockMovementUseCase'

type Database = NodePgDatabase<typeof schema>

const STOCK_MOVEMENT_TYPES = ['in', 'out', 'adjustment', 'loss'] as const

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

    const ingredientId = request.query['ingredientId']
    if (!ingredientId) throw new ValidationError('Parâmetro ingredientId é obrigatório')

    const pageRequest = parsePageRequest(request.query)
    const movementTypes = parseAllowedList(request.query['movementType'], STOCK_MOVEMENT_TYPES)
    const where = and(
      eq(schema.stockMovements.establishmentId, establishmentId),
      eq(schema.stockMovements.ingredientId, ingredientId),
      movementTypes.length ? inArray(schema.stockMovements.movementType, movementTypes) : undefined
    )

    const [movements, [totalRow]] = await Promise.all([
      this.db
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
        .where(where)
        .orderBy(desc(schema.stockMovements.createdAt), asc(schema.stockMovements.id))
        .limit(pageRequest.pageSize)
        .offset(pageRequest.offset),
      this.db.select({ total: count() }).from(schema.stockMovements).where(where),
    ])

    response.json(buildPageResult(movements, totalRow?.total ?? 0, pageRequest))
  }
}
