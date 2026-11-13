import type { StaffRepository } from '../../domain/repositories/StaffRepository'
import { NotFoundError, ForbiddenError } from '@/shared/errors/AppError'

export class DeleteStaffUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(id: string, establishmentId: string, requesterId: string): Promise<void> {
    if (id === requesterId) throw new ForbiddenError()

    const existing = await this.staffRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Funcionário')

    await this.staffRepository.delete(id, establishmentId)
  }
}
