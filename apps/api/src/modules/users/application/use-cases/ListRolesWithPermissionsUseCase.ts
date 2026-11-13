import type { StaffRepository, Role, Permission } from '../../domain/repositories/StaffRepository'

export class ListRolesWithPermissionsUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(
    establishmentId: string
  ): Promise<Array<{ role: Role; permissions: Permission[] }>> {
    return this.staffRepository.listRolesWithPermissions(establishmentId)
  }
}
