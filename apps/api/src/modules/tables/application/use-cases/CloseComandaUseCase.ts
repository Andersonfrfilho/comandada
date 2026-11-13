import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { ComandaRepository } from '../../domain/repositories/ComandaRepository'
import type { Comanda } from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

export class CloseComandaUseCase {
  constructor(
    private readonly tableRepository: TableRepository,
    private readonly comandaRepository: ComandaRepository
  ) {}

  async execute(comandaId: string, establishmentId: string, status: 'closed' | 'paid'): Promise<Comanda> {
    const target = await this.comandaRepository.findById(comandaId, establishmentId)
    if (!target) throw new NotFoundError('Comanda')

    const closed = await this.comandaRepository.close(comandaId, establishmentId, status)

    const otherOpen = await this.comandaRepository.findOpenByTable(target.tableId, establishmentId)
    if (!otherOpen) {
      await this.tableRepository.updateStatus(target.tableId, establishmentId, 'available')
    }

    return closed
  }
}
