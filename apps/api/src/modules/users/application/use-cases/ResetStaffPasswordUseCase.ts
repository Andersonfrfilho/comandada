import argon2 from 'argon2'
import type { StaffRepository } from '../../domain/repositories/StaffRepository'
import { NotFoundError } from '@/shared/errors/AppError'

export class ResetStaffPasswordUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(id: string, establishmentId: string, newPassword: string): Promise<void> {
    const existing = await this.staffRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Funcionário')

    const passwordHash = await argon2.hash(newPassword)
    await this.staffRepository.resetPassword(id, establishmentId, passwordHash)
  }
}
