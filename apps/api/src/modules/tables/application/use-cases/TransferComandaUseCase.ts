import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { ComandaRepository } from '../../domain/repositories/ComandaRepository'

/** Cliente mudou de mesa: a comanda e os pedidos dela vão juntos; a mesa antiga libera se ficar vazia. */
export class TransferComandaUseCase {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly tableRepository: TableRepository,
    private readonly comandaRepository: ComandaRepository
  ) {}

  async execute(comandaId: string, targetTableId: string, establishmentId: string): Promise<schema.Comanda> {
    const comanda = await this.comandaRepository.findById(comandaId, establishmentId)
    if (!comanda) throw new NotFoundError('Comanda')
    if (comanda.status !== 'open') throw new UnprocessableError(MessagesConstants.comanda.alreadyClosed)
    if (comanda.tableId === targetTableId) throw new UnprocessableError(MessagesConstants.comanda.sameTable)
    const target = await this.tableRepository.findById(targetTableId, establishmentId)
    if (!target) throw new NotFoundError('Mesa')

    const [moved] = await this.db
      .update(schema.comandas)
      .set({ tableId: targetTableId })
      .where(and(eq(schema.comandas.id, comandaId), eq(schema.comandas.establishmentId, establishmentId)))
      .returning()
    await this.db
      .update(schema.orders)
      .set({ tableId: targetTableId })
      .where(and(eq(schema.orders.comandaId, comandaId), eq(schema.orders.establishmentId, establishmentId)))

    await this.tableRepository.updateStatus(targetTableId, establishmentId, 'occupied')
    const otherOpen = await this.comandaRepository.findOpenByTable(comanda.tableId, establishmentId)
    if (!otherOpen) await this.tableRepository.updateStatus(comanda.tableId, establishmentId, 'available')

    return moved!
  }
}
