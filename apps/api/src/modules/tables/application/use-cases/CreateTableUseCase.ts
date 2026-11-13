import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { RestaurantTable } from '@/infra/database/schema'
import { ConflictError } from '@/shared/errors/AppError'

export class CreateTableUseCase {
  constructor(private readonly tableRepository: TableRepository) {}

  async execute(establishmentId: string, number: number, capacity: number): Promise<RestaurantTable> {
    const existing = await this.tableRepository.findByNumber(number, establishmentId)
    if (existing) throw new ConflictError(`Mesa ${number} já existe`)
    return this.tableRepository.create({ establishmentId, number, capacity })
  }
}
