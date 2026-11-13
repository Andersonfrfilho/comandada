import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { CreateRoleUseCase } from '../../application/use-cases/CreateRoleUseCase'
import type { UpdateRoleUseCase } from '../../application/use-cases/UpdateRoleUseCase'
import type { DeleteRoleUseCase } from '../../application/use-cases/DeleteRoleUseCase'
import type { GetRoleWithPermissionsUseCase } from '../../application/use-cases/GetRoleWithPermissionsUseCase'
import type { ListRolesWithPermissionsUseCase } from '../../application/use-cases/ListRolesWithPermissionsUseCase'
import type { AssignPermissionsUseCase } from '../../application/use-cases/AssignPermissionsUseCase'

const roleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
})

const assignPermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      resource: z.string().min(1),
      action: z.string().min(1),
    })
  ),
})

export class RoleController {
  constructor(
    private readonly listRolesWithPermissionsUseCase: ListRolesWithPermissionsUseCase,
    private readonly getRoleWithPermissionsUseCase: GetRoleWithPermissionsUseCase,
    private readonly createRoleUseCase: CreateRoleUseCase,
    private readonly updateRoleUseCase: UpdateRoleUseCase,
    private readonly deleteRoleUseCase: DeleteRoleUseCase,
    private readonly assignPermissionsUseCase: AssignPermissionsUseCase
  ) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const roles = await this.listRolesWithPermissionsUseCase.execute(
      request.user.establishmentId
    )
    response.json(roles)
  }

  get: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = request.params['id']!
    const result = await this.getRoleWithPermissionsUseCase.execute(
      id,
      request.user.establishmentId
    )

    response.json(result)
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const parsed = roleSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const role = await this.createRoleUseCase.execute(
      request.user.establishmentId,
      parsed.data.name,
      parsed.data.description
    )

    response.json(role, 201)
  }

  update: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = request.params['id']!
    const parsed = roleSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const role = await this.updateRoleUseCase.execute(
      id,
      request.user.establishmentId,
      parsed.data.name,
      parsed.data.description
    )

    response.json(role)
  }

  delete: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = request.params['id']!
    await this.deleteRoleUseCase.execute(id, request.user.establishmentId)
    response.json({ success: true }, 200)
  }

  assignPermissions: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = request.params['id']!
    const parsed = assignPermissionsSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    await this.assignPermissionsUseCase.execute(id, parsed.data.permissions)
    response.json({ success: true }, 200)
  }
}
