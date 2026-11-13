import { eq, and, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import type { CashMovementType, PaymentMethod } from '@/shared/types'
import type { TriggerFiscalEmissionUseCase } from '@/modules/fiscal/application/use-cases/TriggerFiscalEmissionUseCase'

type Database = NodePgDatabase<typeof schema>

interface AddMovementInput {
  establishmentId: string
  type: CashMovementType
  paymentMethod?: PaymentMethod | undefined
  amount: number
  orderId?: string | undefined
  notes?: string | undefined
}

export class AddCashMovementUseCase {
  constructor(
    private readonly db: Database,
    private readonly triggerFiscal?: TriggerFiscalEmissionUseCase
  ) {}

  async execute(input: AddMovementInput) {
    const openRegister = await this.db.query.cashRegisters.findFirst({
      where: and(
        eq(schema.cashRegisters.establishmentId, input.establishmentId),
        eq(schema.cashRegisters.status, 'open')
      ),
    })

    if (!openRegister) {
      throw new NotFoundError(MessagesConstants.cashRegister.notOpen)
    }

    const [movement] = await this.db
      .insert(schema.cashMovements)
      .values({
        cashRegisterId: openRegister.id,
        orderId: input.orderId ?? null,
        type: input.type,
        paymentMethod: input.paymentMethod ?? null,
        amount: input.amount.toFixed(2),
        notes: input.notes ?? null,
      })
      .returning()

    // Fire-and-forget: a payment may trigger the fiscal note, but only once the order is fully paid.
    // A fiscal hiccup must never block the cash movement.
    if (input.type === 'payment' && input.orderId && this.triggerFiscal) {
      void this.maybeTriggerOnFullyPaid(input.orderId, input.establishmentId)
    }

    return movement!
  }

  private async maybeTriggerOnFullyPaid(orderId: string, establishmentId: string): Promise<void> {
    try {
      const order = await this.db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
        columns: { totalAmount: true },
      })
      if (!order) return

      const [paid] = await this.db
        .select({ total: sql<string>`coalesce(sum(${schema.cashMovements.amount}), 0)` })
        .from(schema.cashMovements)
        .where(and(eq(schema.cashMovements.orderId, orderId), eq(schema.cashMovements.type, 'payment')))

      if (!paid || Number(paid.total) < Number(order.totalAmount)) return

      await this.triggerFiscal?.execute({ orderId, establishmentId, event: 'on_payment' })
    } catch (error) {
      console.error('[Fiscal] trigger on_payment failed', error)
    }
  }
}
