import type { UserEntity, UserRole } from '../entities/User'

export interface UserRepository {
  findByEmail(email: string): Promise<UserEntity | null>
  findByIdWithRole(id: string): Promise<(UserEntity & { role: UserRole }) | null>
  updateLastLogin(id: string): Promise<void>
  changePassword(id: string, passwordHash: string): Promise<void>
}
