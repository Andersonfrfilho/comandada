import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { RestaurantTable } from '@/infra/database/schema'

export class ListTablesUseCase {
  constructor(private readonly tableRepository: TableRepository) {}

  async execute(establishmentId: string): Promise<RestaurantTable[]> {
    return this.tableRepository.listByEstablishment(establishmentId)
  }
}
