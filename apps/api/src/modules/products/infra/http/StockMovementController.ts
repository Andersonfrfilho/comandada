import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import { movements } from '@adatechnology/stock-module'
import * as schema from '@/infra/database/schema'
import { orderReturnCondition } from '../../shared/orderStockMovements'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import { buildPageResult, parseAllowedList, parsePageRequest } from '@/shared/utils/listQuery'
import type { CreateStockMovementUseCase } from '@/modules/products/application/use-cases/CreateStockMovementUseCase'

type Database = NodePgDatabase<typeof schema>

const STOCK_MOVEMENT_TYPES = ['in', 'out', 'return', 'adjustment', 'loss'] as const

// O módulo guarda `in/out/adjust/loss` com sinal; a tela antiga espera os tipos e sinais de antes
// (devolução = entrada ligada a pedido, saída sempre positiva, ajuste e perda com sinal).
const movementTypeExpression = sql<string>`CASE
  WHEN ${movements.kind} = 'adjust' THEN 'adjustment'
  WHEN ${orderReturnCondition} THEN 'return'
  ELSE ${movements.kind} END`
const quantityExpression = sql<string>`CASE WHEN ${movements.kind} = 'out' THEN abs(${movements.delta}) ELSE ${movements.delta} END`
const orderIdExpression = sql<string | null>`substring(${movements.sourceKey} from '^order(?:-return)?:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')`

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
      eq(movements.companyId, establishmentId),
      eq(movements.ingredientId, ingredientId),
      movementTypes.length ? inArray(movementTypeExpression, movementTypes) : undefined
    )

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          id: movements.id,
          movementType: movementTypeExpression,
          quantity: quantityExpression,
          reason: movements.reason,
          userName: schema.users.name,
          orderId: orderIdExpression,
          createdAt: movements.createdAt,
        })
        .from(movements)
        .leftJoin(schema.users, sql`${schema.users.id}::text = ${movements.actorId}`)
        .where(where)
        .orderBy(desc(movements.createdAt), asc(movements.id))
        .limit(pageRequest.pageSize)
        .offset(pageRequest.offset),
      this.db.select({ total: count() }).from(movements).where(where),
    ])

    response.json(buildPageResult(rows, totalRow?.total ?? 0, pageRequest))
  }
}
