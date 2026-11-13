import type { StaffRepository, Role, Permission } from '../../domain/repositories/StaffRepository'

export class GetRoleWithPermissionsUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(
    id: string,
    establishmentId: string
  ): Promise<{ role: Role; permissions: Permission[] } | null> {
    return this.staffRepository.getRoleWithPermissions(id, establishmentId)
  }
}
