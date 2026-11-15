import { eq, and, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { summarizeCashRegister } from '../../shared/cashRegisterSummary'
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
  /**
   * Lançamento digitado no painel: confere se a sangria cabe no dinheiro da gaveta e se o pedido
   * existe e não está cancelado. Lançamentos do sistema (conclusão, webhook, estorno) não passam aqui.
   */
  checkAsManualEntry?: boolean | undefined
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

    if (input.checkAsManualEntry) await this.checkManualEntry(input, openRegister)

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

  private async checkManualEntry(input: AddMovementInput, register: schema.CashRegister): Promise<void> {
    if (input.orderId) {
      const order = await this.db.query.orders.findFirst({
        where: and(eq(schema.orders.id, input.orderId), eq(schema.orders.establishmentId, input.establishmentId)),
        columns: { status: true },
      })
      if (!order) throw new NotFoundError(MessagesConstants.cashRegister.orderNotFound)
      if (input.type === 'payment' && order.status === 'cancelled') {
        throw new UnprocessableError(MessagesConstants.cashRegister.paymentForCancelledOrder)
      }
    }

    if (input.type === 'withdrawal') {
      const movements = await this.db
        .select({
          type: schema.cashMovements.type,
          paymentMethod: schema.cashMovements.paymentMethod,
          amount: schema.cashMovements.amount,
        })
        .from(schema.cashMovements)
        .where(eq(schema.cashMovements.cashRegisterId, register.id))
      const { expectedCash } = summarizeCashRegister(register.openingAmount, movements)
      if (Math.round(input.amount * 100) > Math.round(Number(expectedCash) * 100)) {
        throw new UnprocessableError(MessagesConstants.cashRegister.withdrawalAboveCash(expectedCash))
      }
    }
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
