import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import { validateBody } from '@/infra/http/middlewares/validateBody'
import type { PreviewInboundController } from './PreviewInboundController'
import type { PreviewMediaController } from './PreviewMediaController'
import { previewInboundCommandSchema } from './PreviewInbound.schema'
import { previewMediaUploadSchema } from './PreviewMedia.schema'

/**
 * Diferente de `registerWebhookRoutes`, esta é rota do painel: exige JWT e permissão de escrita em
 * conversa, porque forjar um inbound é escrever no transcript de um cliente.
 *
 * Precisa ser registrada antes de `/conversations/:whatsapp/...` — "preview" casaria com o
 * parâmetro dinâmico e a requisição cairia no controller de conversa.
 */
export function registerPreviewInboundRoutes(
  router: Router,
  controller: PreviewInboundController,
  mediaController: PreviewMediaController
): void {
  router.post(
    '/conversations/preview/inbound',
    authenticate,
    authorize('conversations', 'write'),
    validateBody(previewInboundCommandSchema),
    controller.send
  )

  router.post(
    '/conversations/preview/media',
    authenticate,
    authorize('conversations', 'write'),
    validateBody(previewMediaUploadSchema),
    mediaController.upload
  )
}
