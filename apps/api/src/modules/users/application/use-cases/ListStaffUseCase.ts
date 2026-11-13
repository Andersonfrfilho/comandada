import type { StaffRepository, StaffMember } from '../../domain/repositories/StaffRepository'

export class ListStaffUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(establishmentId: string): Promise<StaffMember[]> {
    return this.staffRepository.listByEstablishment(establishmentId)
  }
}
