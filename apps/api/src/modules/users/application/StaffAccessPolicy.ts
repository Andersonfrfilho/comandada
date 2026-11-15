import type { StaffRepository } from '../domain/repositories/StaffRepository'
import { ForbiddenError, NotFoundError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'

export interface ActorPermission {
  resource: string
  action: string
}

function permissionKey(permission: ActorPermission): string {
  return `${permission.resource}:${permission.action}`
}

/** O cargo só cabe em quem o concede se cada permissão dele também for de quem concede. */
export function isRoleWithinActor(rolePermissions: ActorPermission[], actorPermissions: ActorPermission[]): boolean {
  const actorKeys = new Set(actorPermissions.map(permissionKey))
  return rolePermissions.every((permission) => actorKeys.has(permissionKey(permission)))
}

/**
 * Quem cuida da equipe não dá a ninguém (nem a si) mais acesso do que tem, e não mexe em quem tem mais acesso.
 * Sem isso o gerente criava um Administrador e, com ele, ganhava tudo.
 */
export class StaffAccessPolicy {
  constructor(private readonly staffRepository: StaffRepository) {}

  async assertCanGrantRole(roleId: string, establishmentId: string, actorPermissions: ActorPermission[]): Promise<void> {
    const role = await this.staffRepository.getRoleWithPermissions(roleId, establishmentId)
    if (!role) throw new NotFoundError('Cargo')
    if (!isRoleWithinActor(role.permissions, actorPermissions)) {
      throw new ForbiddenError(MessagesConstants.staff.roleAboveActor)
    }
  }

  async assertCanManageMember(memberRoleId: string, establishmentId: string, actorPermissions: ActorPermission[]): Promise<void> {
    const role = await this.staffRepository.getRoleWithPermissions(memberRoleId, establishmentId)
    if (role && !isRoleWithinActor(role.permissions, actorPermissions)) {
      throw new ForbiddenError(MessagesConstants.staff.memberAboveActor)
    }
  }
}
