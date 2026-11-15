import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import type { OpenCashRegisterUseCase } from '../../application/use-cases/OpenCashRegisterUseCase'
import type { CloseCashRegisterUseCase } from '../../application/use-cases/CloseCashRegisterUseCase'
import type { AddCashMovementUseCase } from '../../application/use-cases/AddCashMovementUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import * as schema from '@/infra/database/schema'
import { summarizeCashRegister } from '../../shared/cashRegisterSummary'

type Database = NodePgDatabase<typeof schema>

const HISTORY_DEFAULT_LIMIT = 10
const HISTORY_MAX_LIMIT = 60

const openRegisterSchema = z.object({
  openingAmount: z.number().nonnegative(),
})

const closeRegisterSchema = z.object({
  closingAmount: z.number().nonnegative(),
  notes: z.string().trim().max(500).optional(),
})

const addMovementSchema = z.object({
  type: z.enum(['payment', 'withdrawal', 'supply']),
  paymentMethod: z.enum(['pix', 'card_credit', 'card_debit', 'cash', 'voucher']).optional(),
  amount: z.number().positive(),
  orderId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
})

export class CashierController {
  constructor(
    private readonly openRegisterUseCase: OpenCashRegisterUseCase,
    private readonly closeRegisterUseCase: CloseCashRegisterUseCase,
    private readonly addMovementUseCase: AddCashMovementUseCase,
    private readonly db: Database
  ) {}

  current: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const register = await this.db.query.cashRegisters.findFirst({
      where: and(
        eq(schema.cashRegisters.establishmentId, establishmentId),
        eq(schema.cashRegisters.status, 'open')
      ),
    })

    if (!register) {
      response.json(null)
      return
    }

    const movements = await this.db
      .select()
      .from(schema.cashMovements)
      .where(eq(schema.cashMovements.cashRegisterId, register.id))
      .orderBy(desc(schema.cashMovements.createdAt))

    const summary = summarizeCashRegister(register.openingAmount, movements)

    response.json({
      ...register,
      movements,
      ...summary,
    })
  }

  /** Últimos caixas fechados, com o esperado, o contado e a diferença de cada fechamento. */
  history: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const requestedLimit = Number(request.query['limit'] ?? HISTORY_DEFAULT_LIMIT)
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, HISTORY_MAX_LIMIT)
      : HISTORY_DEFAULT_LIMIT

    const registers = await this.db
      .select({
        id: schema.cashRegisters.id,
        openedAt: schema.cashRegisters.openedAt,
        closedAt: schema.cashRegisters.closedAt,
        openingAmount: schema.cashRegisters.openingAmount,
        closingAmount: schema.cashRegisters.closingAmount,
        expectedCashAmount: schema.cashRegisters.expectedCashAmount,
        closingDifference: schema.cashRegisters.closingDifference,
        closingNotes: schema.cashRegisters.closingNotes,
        closedByName: schema.users.name,
      })
      .from(schema.cashRegisters)
      .leftJoin(schema.users, eq(schema.cashRegisters.closedByUserId, schema.users.id))
      .where(and(
        eq(schema.cashRegisters.establishmentId, request.user.establishmentId),
        eq(schema.cashRegisters.status, 'closed')
      ))
      .orderBy(desc(schema.cashRegisters.closedAt))
      .limit(limit)

    response.json(registers)
  }

  open: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = openRegisterSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    const register = await this.openRegisterUseCase.execute({
      establishmentId: request.user.establishmentId,
      userId: request.user.id,
      openingAmount: parsed.data.openingAmount,
    })
    response.json(register, 201)
  }

  close: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = closeRegisterSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    const register = await this.closeRegisterUseCase.execute({
      registerId: request.params['id']!,
      establishmentId: request.user.establishmentId,
      closingAmount: parsed.data.closingAmount,
      userId: request.user.id,
      notes: parsed.data.notes,
    })
    response.json(register)
  }

  addMovement: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = addMovementSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    const movement = await this.addMovementUseCase.execute({
      establishmentId: request.user.establishmentId,
      ...parsed.data,
      checkAsManualEntry: true,
    })
    response.json(movement, 201)
  }
}
