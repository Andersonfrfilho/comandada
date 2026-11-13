import type { TableRepository, UpdateTableInput } from '../../domain/repositories/TableRepository'
import type { RestaurantTable } from '@/infra/database/schema'
import { NotFoundError, ConflictError } from '@/shared/errors/AppError'

export class UpdateTableUseCase {
  constructor(private readonly tableRepository: TableRepository) {}

  async execute(id: string, establishmentId: string, input: UpdateTableInput): Promise<RestaurantTable> {
    const existing = await this.tableRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Mesa')

    if (input.number !== undefined && input.number !== existing.number) {
      const conflict = await this.tableRepository.findByNumber(input.number, establishmentId)
      if (conflict) throw new ConflictError(`Mesa ${input.number} já existe`)
    }

    return this.tableRepository.update(id, establishmentId, input)
  }
}
