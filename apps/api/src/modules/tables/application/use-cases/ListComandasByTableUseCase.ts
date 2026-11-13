import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { ComandaRepository } from '../../domain/repositories/ComandaRepository'
import type { Comanda } from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

export class ListComandasByTableUseCase {
  constructor(
    private readonly tableRepository: TableRepository,
    private readonly comandaRepository: ComandaRepository
  ) {}

  async execute(tableId: string, establishmentId: string): Promise<Comanda[]> {
    const table = await this.tableRepository.findById(tableId, establishmentId)
    if (!table) throw new NotFoundError('Mesa')

    return this.comandaRepository.listByTable(tableId, establishmentId)
  }
}
