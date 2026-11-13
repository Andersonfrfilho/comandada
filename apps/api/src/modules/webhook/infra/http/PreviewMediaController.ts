import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError } from '@/shared/errors/AppError'
import type { MetaWhatsAppModuleRegistry } from '@/modules/conversations/infra/whatsapp/metaWhatsAppModule'
import { ConversationPreviewDisabledError } from '@/modules/webhook/shared/ConversationPreview.error'
import type { PreviewMediaUpload } from './PreviewMedia.schema'

/**
 * Hospeda o áudio gravado no simulador e devolve o id que o inbound simulado vai referenciar.
 *
 * O webhook da Meta entrega mídia por id, nunca por bytes — sem um id que o canal saiba resolver
 * não existe nota de voz no preview. Onde gravar e como marcar o id é do pacote
 * (`previewMedia`); aqui fica só a porta HTTP, que é o que o SDK não abre no host.
 */
export class PreviewMediaController {
  constructor(private readonly modules: MetaWhatsAppModuleRegistry) {}

  // POST /conversations/preview/media — corpo já validado pelo middleware
  upload: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const companyId = request.user.establishmentId
    const storePreviewMedia = this.modules.forEstablishment(companyId).previewMedia
    // Ausente quando o recurso está desligado ou falta storage: o pacote não monta o use-case.
    if (!storePreviewMedia) throw new ConversationPreviewDisabledError()

    const body = request.body as PreviewMediaUpload
    const stored = await storePreviewMedia.execute({
      companyId,
      buffer: Buffer.from(body.base64, 'base64'),
      mimeType: body.mimeType,
      ...(body.filename ? { filename: body.filename } : {}),
    })

    response.json({ mediaId: stored.mediaId, mimeType: body.mimeType }, 201)
  }
}
