import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { ConflictError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'

type Database = NodePgDatabase<typeof schema>

interface OpenCashRegisterInput {
  establishmentId: string
  userId: string
  openingAmount: number
}

export class OpenCashRegisterUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: OpenCashRegisterInput) {
    const openRegister = await this.db.query.cashRegisters.findFirst({
      where: and(
        eq(schema.cashRegisters.establishmentId, input.establishmentId),
        eq(schema.cashRegisters.status, 'open')
      ),
    })

    if (openRegister) {
      throw new ConflictError(MessagesConstants.cashRegister.alreadyOpen)
    }

    const [register] = await this.db
      .insert(schema.cashRegisters)
      .values({
        establishmentId: input.establishmentId,
        userId: input.userId,
        status: 'open',
        openingAmount: input.openingAmount.toFixed(2),
      })
      .returning()

    return register!
  }
}
