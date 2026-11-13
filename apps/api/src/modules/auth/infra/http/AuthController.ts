import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { LoginUseCase } from '../../application/use-cases/LoginUseCase'
import type { RefreshTokenUseCase } from '../../application/use-cases/RefreshTokenUseCase'
import type { LogoutUseCase } from '../../application/use-cases/LogoutUseCase'
import type { ChangePasswordUseCase } from '../../application/use-cases/ChangePasswordUseCase'
import { ValidationError, UnauthorizedError } from '@/shared/errors/AppError'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
})

export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase
  ) {}

  login: RouteHandler = async (request, response) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const result = await this.loginUseCase.execute(parsed.data)
    response.json(result, 200)
  }

  refresh: RouteHandler = async (request, response) => {
    const parsed = refreshSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const result = await this.refreshTokenUseCase.execute(parsed.data.refreshToken)
    response.json(result, 200)
  }

  logout: RouteHandler = async (request, response) => {
    const parsed = refreshSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new UnauthorizedError('invalid_refresh_token')
    }

    await this.logoutUseCase.execute(parsed.data.refreshToken)
    response.json({ message: 'Logged out successfully' }, 200)
  }

  me: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    response.json({ user: request.user }, 200)
  }

  changePassword: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const parsed = changePasswordSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    await this.changePasswordUseCase.execute({
      userId: request.user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    })

    response.json({ message: 'Senha alterada com sucesso' }, 200)
  }
}
