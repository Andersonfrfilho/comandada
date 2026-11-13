import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { ListStaffUseCase } from '../../application/use-cases/ListStaffUseCase'
import type { CreateStaffUseCase } from '../../application/use-cases/CreateStaffUseCase'
import type { UpdateStaffUseCase } from '../../application/use-cases/UpdateStaffUseCase'
import type { DeleteStaffUseCase } from '../../application/use-cases/DeleteStaffUseCase'
import type { ToggleStaffActiveUseCase } from '../../application/use-cases/ToggleStaffActiveUseCase'
import type { ResetStaffPasswordUseCase } from '../../application/use-cases/ResetStaffPasswordUseCase'
import type { ListRolesUseCase } from '../../application/use-cases/ListRolesUseCase'

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  roleId: z.string().uuid(),
})

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  roleId: z.string().uuid().optional(),
})

const resetPasswordSchema = z.object({
  password: z.string().min(6),
})

export class StaffController {
  constructor(
    private readonly listStaffUseCase: ListStaffUseCase,
    private readonly createStaffUseCase: CreateStaffUseCase,
    private readonly updateStaffUseCase: UpdateStaffUseCase,
    private readonly deleteStaffUseCase: DeleteStaffUseCase,
    private readonly toggleStaffActiveUseCase: ToggleStaffActiveUseCase,
    private readonly resetStaffPasswordUseCase: ResetStaffPasswordUseCase,
    private readonly listRolesUseCase: ListRolesUseCase
  ) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const staff = await this.listStaffUseCase.execute(request.user.establishmentId)
    response.json(staff)
  }

  listRoles: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const roles = await this.listRolesUseCase.execute(request.user.establishmentId)
    response.json(roles)
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const staff = await this.createStaffUseCase.execute({
      establishmentId: request.user.establishmentId,
      ...parsed.data,
    })

    response.json(staff, 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = request.params['id']!
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const staff = await this.updateStaffUseCase.execute(
      id,
      request.user.establishmentId,
      {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.email !== undefined && { email: parsed.data.email }),
        ...(parsed.data.roleId !== undefined && { roleId: parsed.data.roleId }),
      }
    )

    response.json(staff)
  }

  toggleActive: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = request.params['id']!
    const staff = await this.toggleStaffActiveUseCase.execute(
      id,
      request.user.establishmentId,
      request.user.id
    )

    response.json(staff)
  }

  resetPassword: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = request.params['id']!
    const parsed = resetPasswordSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    await this.resetStaffPasswordUseCase.execute(
      id,
      request.user.establishmentId,
      parsed.data.password
    )

    response.json({ success: true }, 200)
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = request.params['id']!
    await this.deleteStaffUseCase.execute(id, request.user.establishmentId, request.user.id)
    response.json({ success: true }, 200)
  }
}
