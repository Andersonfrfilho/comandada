import type { StaffRepository, StaffRole } from '../../domain/repositories/StaffRepository'

export class ListRolesUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(establishmentId: string): Promise<StaffRole[]> {
    return this.staffRepository.listRoles(establishmentId)
  }
}
