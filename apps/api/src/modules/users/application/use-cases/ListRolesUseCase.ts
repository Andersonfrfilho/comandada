import type { StaffRepository, StaffRole } from '../../domain/repositories/StaffRepository'
import { isRoleWithinActor, type ActorPermission } from '../StaffAccessPolicy'

export interface AssignableStaffRole extends StaffRole {
  /** false quando o cargo tem permissão que quem está cadastrando não tem. */
  assignable: boolean
}

export class ListRolesUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(establishmentId: string, actorPermissions: ActorPermission[]): Promise<AssignableStaffRole[]> {
    const roles = await this.staffRepository.listRolesWithPermissions(establishmentId)
    return roles.map(({ role, permissions }) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      assignable: isRoleWithinActor(permissions, actorPermissions),
    }))
  }
}
