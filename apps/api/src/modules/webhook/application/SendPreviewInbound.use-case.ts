/**
 * Entrega no webhook uma mensagem inbound simulada pelo painel.
 *
 * A assinatura é gerada AQUI, com o app secret que só o servidor tem — é isso que permite o
 * simulador existir sem publicar o segredo no bundle do navegador. O que o painel manda é a
 * intenção do cliente; a forma do payload é decidida deste lado.
 *
 * Depois de assinar, entra pelo mesmo `webhook.receive` que atende a Meta, com verificação de HMAC
 * e guarda de replay intactas. Um caminho paralelo testaria outra coisa que não o fluxo real.
 */

import { createHmac } from 'node:crypto'
import {
  buildInboundAudioPayload,
  buildInboundInteractivePayload,
  buildInboundMediaPayload,
  buildInboundTextPayload,
  serializeWebhookPayload,
} from '@adatechnology/meta-whatsapp-contracts/testing'

import type { MetaWhatsAppModuleRegistry } from '@/modules/conversations/infra/whatsapp/metaWhatsAppModule'
import { PREVIEW_INBOUND_KIND } from '@/modules/webhook/shared/ConversationPreview.constant'
import { ConversationPreviewDisabledError } from '@/modules/webhook/shared/ConversationPreview.error'
import type { PreviewInboundCommand } from '../infra/http/PreviewInbound.schema'

export interface SendPreviewInboundParams {
  readonly companyId: string
  readonly command: PreviewInboundCommand
}

function buildPayload(command: PreviewInboundCommand) {
  const envelope = { from: command.from }

  switch (command.kind) {
    case PREVIEW_INBOUND_KIND.TEXT:
      return buildInboundTextPayload({ ...envelope, text: command.text })
    case PREVIEW_INBOUND_KIND.BUTTON_REPLY:
      return buildInboundInteractivePayload({ ...envelope, buttonReply: command.reply })
    case PREVIEW_INBOUND_KIND.LIST_REPLY:
      return buildInboundInteractivePayload({ ...envelope, listReply: command.reply })
    case PREVIEW_INBOUND_KIND.AUDIO:
      return buildInboundAudioPayload({ ...envelope, mediaId: command.mediaId })
    case PREVIEW_INBOUND_KIND.MEDIA:
      return buildInboundMediaPayload({
        ...envelope,
        mediaType: command.mediaType,
        mediaId: command.mediaId,
        ...(command.mimeType ? { mimeType: command.mimeType } : {}),
        ...(command.filename ? { filename: command.filename } : {}),
        ...(command.caption ? { caption: command.caption } : {}),
      })
  }
}

export class SendPreviewInboundUseCase {
  constructor(
    private readonly modules: MetaWhatsAppModuleRegistry,
    private readonly appSecret: string | undefined,
    private readonly isEnabled: boolean
  ) {}

  async execute(params: SendPreviewInboundParams): Promise<void> {
    if (!this.isEnabled || !this.appSecret) {
      throw new ConversationPreviewDisabledError()
    }

    const rawBody = serializeWebhookPayload(buildPayload(params.command))
    const signature = `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`

    await this.modules.forEstablishment(params.companyId).webhook.receive.execute({
      companyId: params.companyId,
      rawBody: Buffer.from(rawBody),
      signatureHeader: signature,
    })
  }
}
