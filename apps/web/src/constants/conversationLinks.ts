/**
 * Ligação entre outras telas e a inbox de conversas.
 *
 * A conversa é endereçada pelo número de WhatsApp — é assim que o backend e o adapter do SDK a
 * identificam, então não há id separado para carregar na URL.
 */

export const CONVERSATION_QUERY_PARAM = 'whatsapp'

export function buildConversationLink(whatsappNumber: string): string {
  return `/conversations?${CONVERSATION_QUERY_PARAM}=${encodeURIComponent(whatsappNumber)}`
}
