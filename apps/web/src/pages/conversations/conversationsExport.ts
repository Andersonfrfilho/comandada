/**
 * Download do transcript. Usa a rota de export, e não as mensagens já em tela, porque a listagem
 * do painel é paginada — baixar o que está visível entregaria um histórico truncado justamente
 * para quem quer auditoria.
 */

import { buildTranscriptFilename, buildTranscriptText, downloadTextFile } from '@adatechnology/conversations-ui'

import { fetchConversationTranscriptMessages } from '@/lib/conversationsSdkApi'

export interface DownloadConversationParams {
  readonly conversationId: string
  readonly whatsappNumber: string
  readonly clientName?: string
}

export async function downloadConversation(params: DownloadConversationParams): Promise<void> {
  const messages = await fetchConversationTranscriptMessages(params.conversationId)

  const text = buildTranscriptText({
    messages,
    whatsappNumber: params.whatsappNumber,
    clientName: params.clientName,
  })

  downloadTextFile(buildTranscriptFilename(params.whatsappNumber, new Date()), text)
}
