import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError } from '@/shared/errors/AppError'
import type { SendPreviewInboundUseCase } from '../../application/SendPreviewInbound.use-case'
import type { PreviewInboundCommand } from './PreviewInbound.schema'

export class PreviewInboundController {
  constructor(private readonly sendPreviewInbound: SendPreviewInboundUseCase) {}

  // POST /conversations/preview/inbound — o corpo já veio validado pelo middleware
  send: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    await this.sendPreviewInbound.execute({
      companyId: request.user.establishmentId,
      command: request.body as PreviewInboundCommand,
    })

    response.json({ status: 'accepted' }, 202)
  }
}
