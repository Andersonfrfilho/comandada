/**
 * Hospeda no nosso storage o arquivo gravado no simulador e devolve a referência que o inbound
 * simulado carrega.
 *
 * O webhook da Meta entrega mídia por id, nunca por bytes: sem um id que o canal saiba resolver não
 * há nota de voz no preview — e é a existência desta função que faz o painel desenhar o microfone.
 */

import type { PreviewUploadedMedia } from '@adatechnology/conversations-ui/preview'

import { api } from '@/lib/api'
import { fileToAttachment } from '@/lib/fileToAttachment'

interface PreviewMediaResponse {
  readonly mediaId: string
  readonly mimeType?: string
}

export async function uploadPreviewMedia(file: File): Promise<PreviewUploadedMedia> {
  const attachment = await fileToAttachment(file)
  const uploaded = await api.post<PreviewMediaResponse>('/conversations/preview/media', attachment)

  return {
    mediaId: uploaded.mediaId,
    mimeType: uploaded.mimeType ?? attachment.mimeType,
    filename: attachment.filename,
  }
}
