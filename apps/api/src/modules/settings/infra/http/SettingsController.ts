import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { GetSettingsUseCase } from '../../application/use-cases/GetSettingsUseCase'
import type { UpsertSettingUseCase } from '../../application/use-cases/UpsertSettingUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'

const upsertSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
})

export class SettingsController {
  constructor(
    private readonly getSettingsUseCase: GetSettingsUseCase,
    private readonly upsertSettingUseCase: UpsertSettingUseCase
  ) {}

  get: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const settings = await this.getSettingsUseCase.execute(request.user.establishmentId)
    response.json(settings)
  }

  upsert: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = upsertSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    const setting = await this.upsertSettingUseCase.execute({
      establishmentId: request.user.establishmentId,
      key: parsed.data.key,
      value: parsed.data.value,
    })
    response.json(setting)
  }
}
