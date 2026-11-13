import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import type { OpenCashRegisterUseCase } from '../../application/use-cases/OpenCashRegisterUseCase'
import type { CloseCashRegisterUseCase } from '../../application/use-cases/CloseCashRegisterUseCase'
import type { AddCashMovementUseCase } from '../../application/use-cases/AddCashMovementUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

const openRegisterSchema = z.object({
  openingAmount: z.number().nonnegative(),
})

const closeRegisterSchema = z.object({
  closingAmount: z.number().nonnegative(),
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

    const totalIn = movements
      .filter((m) => m.type === 'payment' || m.type === 'supply')
      .reduce((s, m) => s + Number(m.amount), 0)

    const totalOut = movements
      .filter((m) => m.type === 'withdrawal')
      .reduce((s, m) => s + Number(m.amount), 0)

    const balance = Number(register.openingAmount) + totalIn - totalOut

    response.json({
      ...register,
      movements,
      totalIn: totalIn.toFixed(2),
      totalOut: totalOut.toFixed(2),
      balance: balance.toFixed(2),
    })
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
    })
    response.json(movement, 201)
  }
}
