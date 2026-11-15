import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { ComandaRepository } from '../../domain/repositories/ComandaRepository'
import type { Comanda } from '@/infra/database/schema'
import { UnprocessableError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import type { GetComandaBillUseCase } from './GetComandaBillUseCase'
import { formatMoney } from '../services/formatMoney'

/**
 * Encerrar sem receber: só quando não sobra nada a pagar (comanda aberta por engano, pedidos
 * cancelados ou já pagos). Conta com valor em aberto passa por "Receber conta"; comanda encerrada
 * não reabre nem troca de paga para não paga.
 */
export class CloseComandaUseCase {
  constructor(
    private readonly tableRepository: TableRepository,
    private readonly comandaRepository: ComandaRepository,
    private readonly getBill: Pick<GetComandaBillUseCase, 'execute'>
  ) {}

  async execute(comandaId: string, establishmentId: string): Promise<Comanda> {
    const bill = await this.getBill.execute(comandaId, establishmentId)
    if (bill.comanda.status !== 'open') throw new UnprocessableError(MessagesConstants.comanda.alreadyClosed)
    if (bill.outstandingAmount > 0) {
      throw new UnprocessableError(MessagesConstants.comanda.hasOpenBalance(formatMoney(bill.outstandingAmount)))
    }

    const hasOrders = bill.orders.some((order) => order.status !== 'cancelled')
    const closed = await this.comandaRepository.close(comandaId, establishmentId, hasOrders ? 'paid' : 'closed')

    const otherOpen = await this.comandaRepository.findOpenByTable(bill.comanda.tableId, establishmentId)
    if (!otherOpen) await this.tableRepository.updateStatus(bill.comanda.tableId, establishmentId, 'available')

    return closed
  }
}
