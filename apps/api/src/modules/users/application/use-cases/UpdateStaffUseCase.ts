import type { StaffRepository, StaffMember } from '../../domain/repositories/StaffRepository'
import { NotFoundError, ConflictError } from '@/shared/errors/AppError'

interface UpdateStaffInput {
  name?: string
  email?: string
  roleId?: string
}

export class UpdateStaffUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(id: string, establishmentId: string, input: UpdateStaffInput): Promise<StaffMember> {
    const existing = await this.staffRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Funcionário')

    if (input.email && input.email !== existing.email) {
      const taken = await this.staffRepository.findByEmail(input.email)
      if (taken) throw new ConflictError('Email já está em uso')
    }

    if (input.roleId) {
      const roles = await this.staffRepository.listRoles(establishmentId)
      const roleExists = roles.some((r) => r.id === input.roleId)
      if (!roleExists) throw new NotFoundError('Cargo')
    }

    return this.staffRepository.update(id, establishmentId, input)
  }
}
