import { META_SIGNATURE_HEADER, BOT_FORWARD_TIMEOUT_MS } from '../../shared/WhatsAppInbound.constant'
import type { WhatsAppInboundJobData } from '@/infra/queue/QueueNames.constant'

export type FetchFunction = (input: string, init: RequestInit) => Promise<Response>

/**
 * Repassa ao webhook do bot no n8n exatamente o que a Meta mandou. O n8n confere a assinatura de
 * novo e descarta id de mensagem repetido, então reentregar depois de uma falha é seguro.
 */
export async function forwardWhatsAppInbound(
  data: WhatsAppInboundJobData,
  botWebhookUrl: string | undefined,
  fetchFunction: FetchFunction = fetch
): Promise<void> {
  // Sem destino a mensagem não tem para onde ir: falhar mantém o job na fila em vez de descartá-lo.
  if (!botWebhookUrl) throw new Error('N8N_BOT_WEBHOOK_URL not set')

  const response = await fetchFunction(botWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [META_SIGNATURE_HEADER]: data.signature,
    },
    body: data.rawBody,
    signal: AbortSignal.timeout(BOT_FORWARD_TIMEOUT_MS),
  })

  if (!response.ok) {
    const reason = await response.text().catch(() => 'unknown')
    throw new Error(`n8n responded ${response.status}: ${reason.slice(0, 200)}`)
  }
}
