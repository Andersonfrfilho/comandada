import type { StaffRepository } from '../../domain/repositories/StaffRepository'

export class DeleteRoleUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(id: string, establishmentId: string): Promise<void> {
    await this.staffRepository.deleteRole(id, establishmentId)
  }
}
