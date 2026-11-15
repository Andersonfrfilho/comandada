import type { StaffRepository, StaffMember } from '../../domain/repositories/StaffRepository'
import { NotFoundError, ForbiddenError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import type { ActorPermission, StaffAccessPolicy } from '../StaffAccessPolicy'

export class ToggleStaffActiveUseCase {
  constructor(
    private readonly staffRepository: StaffRepository,
    private readonly accessPolicy: StaffAccessPolicy
  ) {}

  async execute(id: string, establishmentId: string, requesterId: string, actorPermissions: ActorPermission[]): Promise<StaffMember> {
    if (id === requesterId) throw new ForbiddenError(MessagesConstants.staff.cannotChangeSelf)

    const existing = await this.staffRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Funcionário')
    await this.accessPolicy.assertCanManageMember(existing.roleId, establishmentId, actorPermissions)

    return this.staffRepository.toggleActive(id, establishmentId)
  }
}
