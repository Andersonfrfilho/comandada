import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { UnprocessableError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import { cashMethodForPaymentName } from '@/shared/constants/paymentMethods.constant'
import type { AddCashMovementUseCase } from '@/modules/cashier/application/use-cases/AddCashMovementUseCase'
import type { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { ComandaRepository } from '../../domain/repositories/ComandaRepository'
import { allocateComandaPayments, type ComandaPaymentPart } from '../services/allocateComandaPayments'
import type { ComandaBill, GetComandaBillUseCase } from './GetComandaBillUseCase'
import { formatMoney } from '../services/formatMoney'

type Database = NodePgDatabase<typeof schema>

export interface SettleComandaInput {
  comandaId: string
  establishmentId: string
  userId?: string | undefined
  payments: ComandaPaymentPart[]
}

// Mesma folga do pedido do painel para divisão por pessoa (3 x 33,33 de 100,00).
const PAYMENT_ROUNDING_TOLERANCE = 0.05

/**
 * Receber a conta da mesa: confere que os pagamentos fecham o que falta, lança cada parte no caixa
 * ligada ao pedido (para relatório e nota), conclui os pedidos ainda abertos e só então encerra a
 * comanda como paga e libera a mesa. Antes "Pago" só mudava o status da comanda.
 */
export class SettleComandaUseCase {
  constructor(
    private readonly db: Database,
    private readonly getBill: Pick<GetComandaBillUseCase, 'execute'>,
    private readonly addCashMovement: Pick<AddCashMovementUseCase, 'execute'>,
    private readonly updateOrderStatus: Pick<UpdateOrderStatusUseCase, 'execute'>,
    private readonly tableRepository: TableRepository,
    private readonly comandaRepository: ComandaRepository
  ) {}

  async execute(input: SettleComandaInput): Promise<ComandaBill> {
    const bill = await this.getBill.execute(input.comandaId, input.establishmentId)
    if (bill.comanda.status !== 'open') throw new UnprocessableError(MessagesConstants.comanda.alreadyClosed)

    const outstanding = bill.orders.filter((order) => order.outstandingAmount > 0)
    if (outstanding.length > 0) {
      await this.checkPayments(input.payments, bill.outstandingAmount, input.establishmentId)

      const parts = allocateComandaPayments(
        outstanding.map((order) => ({ orderId: order.id, outstandingAmount: order.outstandingAmount })),
        input.payments
      )
      const outstandingIds = outstanding.map((order) => order.id)
      // As partes da conta substituem o pagamento previsto no lançamento: é o que o cliente pagou.
      await this.db.delete(schema.orderPayments).where(inArray(schema.orderPayments.orderId, outstandingIds))
      for (const part of parts) {
        await this.db.insert(schema.orderPayments).values({
          orderId: part.orderId,
          paymentTypeName: part.paymentTypeName,
          amount: part.amount.toFixed(2),
          changeFor: part.changeFor !== undefined ? part.changeFor.toFixed(2) : null,
          splitLabel: part.splitLabel ?? null,
        })
        await this.addCashMovement.execute({
          establishmentId: input.establishmentId,
          type: 'payment',
          paymentMethod: cashMethodForPaymentName(part.paymentTypeName),
          amount: part.amount,
          orderId: part.orderId,
          notes: [`Mesa ${bill.comanda.tableNumber}`, part.splitLabel].filter(Boolean).join(' · '),
        })
      }
    }

    // Cliente pagou e foi embora: pedido que ainda estava aberto vira concluído (baixa de estoque e
    // nota seguem a regra de sempre). O lançamento já existe, então a conclusão não lança de novo.
    for (const order of bill.orders) {
      if (order.status === 'completed' || order.status === 'cancelled') continue
      await this.updateOrderStatus.execute({
        orderId: order.id,
        establishmentId: input.establishmentId,
        newStatus: 'completed',
        manual: true,
        note: MessagesConstants.comanda.settledNote,
        userId: input.userId,
      })
    }

    await this.comandaRepository.close(input.comandaId, input.establishmentId, 'paid')
    const otherOpen = await this.comandaRepository.findOpenByTable(bill.comanda.tableId, input.establishmentId)
    if (!otherOpen) await this.tableRepository.updateStatus(bill.comanda.tableId, input.establishmentId, 'available')

    return this.getBill.execute(input.comandaId, input.establishmentId)
  }

  private async checkPayments(payments: ComandaPaymentPart[], due: number, establishmentId: string): Promise<void> {
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0)
    if (payments.length === 0 || Math.abs(paid - due) > PAYMENT_ROUNDING_TOLERANCE) {
      throw new UnprocessableError(MessagesConstants.comanda.paymentsMismatch(formatMoney(paid), formatMoney(due)))
    }
    if (payments.some((payment) => payment.changeFor !== undefined && payment.changeFor < payment.amount)) {
      throw new UnprocessableError(MessagesConstants.comanda.changeBelowAmount)
    }
    const openRegister = await this.db.query.cashRegisters.findFirst({
      where: and(eq(schema.cashRegisters.establishmentId, establishmentId), eq(schema.cashRegisters.status, 'open')),
      columns: { id: true },
    })
    if (!openRegister) throw new UnprocessableError(MessagesConstants.comanda.cashRegisterClosed)
  }
}
