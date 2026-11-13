import type { RouteHandler } from '@/infra/http/router'
import type { GetBrandingUseCase } from '../../application/use-cases/GetBrandingUseCase'
import { UnauthorizedError } from '@/shared/errors/AppError'

export class BrandingController {
  constructor(private readonly getBrandingUseCase: GetBrandingUseCase) {}

  // Tela de login: a marca sai do domínio pelo qual o painel foi aberto.
  getPublic: RouteHandler = async (request, response) => {
    const branding = await this.getBrandingUseCase.forHost(request.query['host'] ?? '')
    response.json(branding)
  }

  // Depois do login: a marca do restaurante de quem entrou, para qualquer papel.
  getMine: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    response.json(await this.getBrandingUseCase.forEstablishment(request.user.establishmentId))
  }
}
