import type { TableRepository } from '../../domain/repositories/TableRepository'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'

export class DeleteTableUseCase {
  constructor(private readonly tableRepository: TableRepository) {}

  async execute(id: string, establishmentId: string): Promise<void> {
    const existing = await this.tableRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Mesa')
    if (existing.status === 'occupied') throw new UnprocessableError('Não é possível excluir uma mesa ocupada')
    await this.tableRepository.delete(id, establishmentId)
  }
}
