import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import { summarizeCashRegister, type CashRegisterSummary } from '../../shared/cashRegisterSummary'

type Database = NodePgDatabase<typeof schema>

interface CloseCashRegisterInput {
  registerId: string
  establishmentId: string
  /** Dinheiro contado na gaveta. */
  closingAmount: number
  userId?: string | undefined
  notes?: string | undefined
}

export interface ClosedCashRegister extends schema.CashRegister {
  summary: CashRegisterSummary
}

/**
 * Fecha o turno comparando o contado com o dinheiro que deveria estar na gaveta (Pix e cartão não
 * entram). A diferença fica gravada no caixa para o histórico de fechamentos.
 */
export class CloseCashRegisterUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: CloseCashRegisterInput): Promise<ClosedCashRegister> {
    return this.db.transaction(async (transaction) => {
      const [register] = await transaction
        .select()
        .from(schema.cashRegisters)
        .where(and(
          eq(schema.cashRegisters.id, input.registerId),
          eq(schema.cashRegisters.establishmentId, input.establishmentId),
          eq(schema.cashRegisters.status, 'open')
        ))
        .for('update')

      if (!register) throw new NotFoundError('CashRegister')

      const movements = await transaction
        .select({
          type: schema.cashMovements.type,
          paymentMethod: schema.cashMovements.paymentMethod,
          amount: schema.cashMovements.amount,
        })
        .from(schema.cashMovements)
        .where(eq(schema.cashMovements.cashRegisterId, register.id))

      const summary = summarizeCashRegister(register.openingAmount, movements)
      const differenceCents = Math.round(input.closingAmount * 100) - Math.round(Number(summary.expectedCash) * 100)

      const [updated] = await transaction
        .update(schema.cashRegisters)
        .set({
          status: 'closed',
          closingAmount: input.closingAmount.toFixed(2),
          expectedCashAmount: summary.expectedCash,
          closingDifference: (differenceCents / 100).toFixed(2),
          closedByUserId: input.userId ?? null,
          closingNotes: input.notes?.trim() || null,
          closedAt: new Date(),
        })
        .where(eq(schema.cashRegisters.id, register.id))
        .returning()

      return { ...updated!, summary }
    })
  }
}
