import type { StaffRepository, StaffMember } from '../../domain/repositories/StaffRepository'
import { NotFoundError, ForbiddenError } from '@/shared/errors/AppError'

export class ToggleStaffActiveUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(id: string, establishmentId: string, requesterId: string): Promise<StaffMember> {
    if (id === requesterId) throw new ForbiddenError()

    const existing = await this.staffRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Funcionário')

    return this.staffRepository.toggleActive(id, establishmentId)
  }
}
