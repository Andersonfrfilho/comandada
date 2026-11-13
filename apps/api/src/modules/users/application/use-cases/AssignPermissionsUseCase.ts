import type { StaffRepository, AssignPermissionInput } from '../../domain/repositories/StaffRepository'

export class AssignPermissionsUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(roleId: string, permissions: AssignPermissionInput[]): Promise<void> {
    await this.staffRepository.assignPermissions(roleId, permissions)
  }
}
