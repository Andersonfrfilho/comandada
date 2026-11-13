import argon2 from 'argon2'
import type { StaffRepository, StaffMember } from '../../domain/repositories/StaffRepository'
import { ConflictError, NotFoundError } from '@/shared/errors/AppError'

interface CreateStaffInput {
  establishmentId: string
  name: string
  email: string
  password: string
  roleId: string
}

export class CreateStaffUseCase {
  constructor(private readonly staffRepository: StaffRepository) {}

  async execute(input: CreateStaffInput): Promise<StaffMember> {
    const roles = await this.staffRepository.listRoles(input.establishmentId)
    const roleExists = roles.some((r) => r.id === input.roleId)
    if (!roleExists) throw new NotFoundError('Role')

    const existing = await this.staffRepository.findByEmail(input.email)
    if (existing) throw new ConflictError('Email já está em uso')

    const passwordHash = await argon2.hash(input.password)

    return this.staffRepository.create({
      establishmentId: input.establishmentId,
      name: input.name,
      email: input.email,
      passwordHash,
      roleId: input.roleId,
    })
  }
}
