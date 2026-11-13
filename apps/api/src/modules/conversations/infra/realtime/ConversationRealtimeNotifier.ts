/**
 * Ponte entre o notificador de tempo real do @adatechnology/meta-whatsapp-module e o WebSocketHub
 * do Order Hub.
 *
 * Duas traduções acontecem aqui, e nenhuma delas pode subir para o pacote:
 *
 * 1. **Tenant.** Os eventos do módulo não carregam `companyId` — o pacote assume uma instância por
 *    empresa. O hub do Order Hub entrega por sala de `establishmentId`. Cada notificador é criado
 *    amarrado a um estabelecimento; publicar sem essa amarração vazaria número de conversa entre
 *    tenants.
 * 2. **Vocabulário.** O módulo emite `(canal, evento)`; o WebSocket entrega `{ type, payload }`
 *    num único fluxo. O canal `conv:<numero>` vira `whatsappNumber` no payload, que é como o
 *    cliente decide se o evento é da conversa aberta.
 */

import type { RealtimeNotifierInterface } from '@adatechnology/meta-whatsapp-contracts'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'

const CONVERSATION_CHANNEL_PREFIX = 'conv:'
const EVENT_TYPE_PREFIX = 'conversation:'

export function createConversationRealtimeNotifier(
  webSocketHub: WebSocketHub,
  establishmentId: string
): RealtimeNotifierInterface {
  return {
    emit(channel: string, event: string, payload: Record<string, unknown>): void {
      const whatsappNumber = channel.startsWith(CONVERSATION_CHANNEL_PREFIX)
        ? channel.slice(CONVERSATION_CHANNEL_PREFIX.length)
        : undefined

      const enrichedPayload =
        whatsappNumber === undefined ? payload : { ...payload, whatsappNumber }

      // `emit` é síncrono no contrato do módulo; a entrega é best-effort e nunca derruba o fluxo.
      void webSocketHub
        .publishBroadcast(establishmentId, `${EVENT_TYPE_PREFIX}${event}`, enrichedPayload)
        .catch(() => undefined)
    },
  }
}
