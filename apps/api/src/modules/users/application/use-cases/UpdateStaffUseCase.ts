import type { StaffRepository, StaffMember } from '../../domain/repositories/StaffRepository'
import { NotFoundError, ConflictError } from '@/shared/errors/AppError'
import type { ActorPermission, StaffAccessPolicy } from '../StaffAccessPolicy'

interface UpdateStaffInput {
  name?: string
  email?: string
  roleId?: string
}

export class UpdateStaffUseCase {
  constructor(
    private readonly staffRepository: StaffRepository,
    private readonly accessPolicy: StaffAccessPolicy
  ) {}

  async execute(
    id: string,
    establishmentId: string,
    input: UpdateStaffInput,
    actorPermissions: ActorPermission[]
  ): Promise<StaffMember> {
    const existing = await this.staffRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Funcionário')
    await this.accessPolicy.assertCanManageMember(existing.roleId, establishmentId, actorPermissions)

    if (input.email && input.email !== existing.email) {
      const taken = await this.staffRepository.findByEmail(input.email)
      if (taken) throw new ConflictError('Email já está em uso')
    }

    if (input.roleId && input.roleId !== existing.roleId) {
      await this.accessPolicy.assertCanGrantRole(input.roleId, establishmentId, actorPermissions)
    }

    return this.staffRepository.update(id, establishmentId, input)
  }
}
