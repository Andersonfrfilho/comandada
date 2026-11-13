import type { RestaurantTable } from '@/infra/database/schema'

export interface CreateTableInput {
  establishmentId: string
  number: number
  capacity: number
}

export interface UpdateTableInput {
  number?: number | undefined
  capacity?: number | undefined
}

export interface TableRepository {
  listByEstablishment(establishmentId: string): Promise<RestaurantTable[]>
  findById(id: string, establishmentId: string): Promise<RestaurantTable | null>
  findByNumber(number: number, establishmentId: string): Promise<RestaurantTable | null>
  create(input: CreateTableInput): Promise<RestaurantTable>
  update(id: string, establishmentId: string, input: UpdateTableInput): Promise<RestaurantTable>
  updateStatus(id: string, establishmentId: string, status: 'available' | 'occupied' | 'reserved'): Promise<RestaurantTable>
  updatePosition(id: string, establishmentId: string, positionX: number, positionY: number): Promise<RestaurantTable>
  delete(id: string, establishmentId: string): Promise<void>
}
