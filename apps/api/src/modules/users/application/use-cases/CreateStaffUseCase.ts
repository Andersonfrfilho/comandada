import argon2 from 'argon2'
import type { StaffRepository, StaffMember } from '../../domain/repositories/StaffRepository'
import { ConflictError } from '@/shared/errors/AppError'
import type { ActorPermission, StaffAccessPolicy } from '../StaffAccessPolicy'

interface CreateStaffInput {
  establishmentId: string
  name: string
  email: string
  password: string
  roleId: string
  actorPermissions: ActorPermission[]
}

export class CreateStaffUseCase {
  constructor(
    private readonly staffRepository: StaffRepository,
    private readonly accessPolicy: StaffAccessPolicy
  ) {}

  async execute(input: CreateStaffInput): Promise<StaffMember> {
    await this.accessPolicy.assertCanGrantRole(input.roleId, input.establishmentId, input.actorPermissions)

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
