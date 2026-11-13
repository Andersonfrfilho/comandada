import argon2 from 'argon2'
import type { UserRepository } from '../../domain/repositories/UserRepository'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'

interface ChangePasswordInput {
  userId: string
  currentPassword: string
  newPassword: string
}

export class ChangePasswordUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const user = await this.userRepository.findByIdWithRole(input.userId)
    if (!user) throw new UnauthorizedError()

    const passwordMatches = await argon2.verify(user.passwordHash, input.currentPassword)
    if (!passwordMatches) throw new UnauthorizedError('current_password_invalid')

    if (input.newPassword.length < 6) {
      throw new ValidationError('Nova senha deve ter pelo menos 6 caracteres')
    }

    if (input.currentPassword === input.newPassword) {
      throw new ValidationError('Nova senha deve ser diferente da senha atual')
    }

    const newHash = await argon2.hash(input.newPassword)
    await this.userRepository.changePassword(input.userId, newHash)
  }
}
