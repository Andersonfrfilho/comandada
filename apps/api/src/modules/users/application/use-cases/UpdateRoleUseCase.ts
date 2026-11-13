import type { StaffRepository, Role } from '../../domain/repositories/StaffRepository'

export class UpdateRoleUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(
    id: string,
    establishmentId: string,
    name: string,
    description?: string
  ): Promise<Role> {
    return this.staffRepository.updateRole(id, establishmentId, name, description)
  }
}
