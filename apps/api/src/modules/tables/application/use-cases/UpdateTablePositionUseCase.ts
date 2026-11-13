import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { RestaurantTable } from '@/infra/database/schema'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { NotFoundError } from '@/shared/errors/AppError'

export interface UpdateTablePositionParams {
  id: string
  establishmentId: string
  positionX: number
  positionY: number
  userId?: string
}

export class UpdateTablePositionUseCase {
  constructor(
    private readonly tableRepository: TableRepository,
    private readonly createAuditLogUseCase: CreateAuditLogUseCase
  ) {}

  async execute(params: UpdateTablePositionParams): Promise<RestaurantTable> {
    const { id, establishmentId, positionX, positionY, userId } = params

    const existing = await this.tableRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Mesa')

    const unchanged = existing.positionX === positionX && existing.positionY === positionY
    if (unchanged) return existing

    const table = await this.tableRepository.updatePosition(id, establishmentId, positionX, positionY)

    await this.createAuditLogUseCase.execute({
      establishmentId,
      ...(userId ? { userId } : {}),
      action: 'table.moved',
      resourceType: 'table',
      resourceId: id,
      metadata: {
        tableNumber: existing.number,
        from: { positionX: existing.positionX, positionY: existing.positionY },
        to: { positionX, positionY },
      },
    })

    return table
  }
}
