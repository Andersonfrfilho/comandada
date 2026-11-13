import type { StaffRepository, Role } from '../../domain/repositories/StaffRepository'

export class CreateRoleUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(establishmentId: string, name: string, description?: string): Promise<Role> {
    return this.staffRepository.createRole(establishmentId, name, description)
  }
}
