import type { RouteHandler } from '@/infra/http/router'
import type { EnqueueWhatsAppInboundUseCase } from '../../application/EnqueueWhatsAppInbound.use-case'
import { META_SIGNATURE_HEADER } from '../../shared/WhatsAppInbound.constant'

export class WhatsAppInboundController {
  constructor(private readonly enqueueWhatsAppInbound: EnqueueWhatsAppInboundUseCase) {}

  // POST /webhooks/whatsapp — a Meta só precisa saber que recebemos; o bot roda no worker.
  // Assinatura inválida responde 401; fila fora do ar responde 500, e a Meta reentrega depois.
  receive: RouteHandler = async (request, response) => {
    const result = await this.enqueueWhatsAppInbound.execute({
      rawBody: request.rawBody,
      signature: request.headers[META_SIGNATURE_HEADER],
    })
    response.json({ status: 'ok', enqueued: result.enqueued })
  }
}
