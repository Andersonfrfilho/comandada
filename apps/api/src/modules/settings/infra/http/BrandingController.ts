import type { RouteHandler } from '@/infra/http/router'
import type { GetBrandingUseCase } from '../../application/use-cases/GetBrandingUseCase'
import type { BrandStickerService } from '../../application/services/BrandStickerService'
import { BRAND_HEADER, BRAND_STICKER } from '../../shared/brandSticker.constant'
import { NotFoundError, UnauthorizedError } from '@/shared/errors/AppError'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class BrandingController {
  constructor(
    private readonly getBrandingUseCase: GetBrandingUseCase,
    private readonly brandStickerService?: BrandStickerService
  ) {}

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

  // Figurinha do logo que o bot manda na saudação. Pública porque a Meta baixa pela URL.
  getSticker: RouteHandler = async (request, response) => {
    const establishmentId = request.params['establishmentId'] ?? ''
    if (!UUID_PATTERN.test(establishmentId)) throw new NotFoundError('Figurinha')
    const sticker = this.brandStickerService ? await this.brandStickerService.forEstablishment(establishmentId) : null
    if (!sticker) throw new NotFoundError('Figurinha')
    response.binary(sticker.webp, BRAND_STICKER.contentType)
  }

  // Cabeçalho da saudação do bot (logo na faixa da cor da marca). Público porque a Meta baixa pela URL.
  getHeader: RouteHandler = async (request, response) => {
    const establishmentId = request.params['establishmentId'] ?? ''
    if (!UUID_PATTERN.test(establishmentId)) throw new NotFoundError('Cabeçalho')
    const header = this.brandStickerService ? await this.brandStickerService.headerForEstablishment(establishmentId) : null
    if (!header) throw new NotFoundError('Cabeçalho')
    response.binary(header.jpeg, BRAND_HEADER.contentType)
  }
}
