import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

interface CloseCashRegisterInput {
  registerId: string
  establishmentId: string
  closingAmount: number
}

export class CloseCashRegisterUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: CloseCashRegisterInput) {
    const register = await this.db.query.cashRegisters.findFirst({
      where: and(
        eq(schema.cashRegisters.id, input.registerId),
        eq(schema.cashRegisters.establishmentId, input.establishmentId),
        eq(schema.cashRegisters.status, 'open')
      ),
    })

    if (!register) throw new NotFoundError('CashRegister')

    const [updated] = await this.db
      .update(schema.cashRegisters)
      .set({
        status: 'closed',
        closingAmount: input.closingAmount.toFixed(2),
        closedAt: new Date(),
      })
      .where(eq(schema.cashRegisters.id, input.registerId))
      .returning()

    return updated!
  }
}
