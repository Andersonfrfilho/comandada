/**
 * `SSEProvider` do @adatechnology/conversations-ui servido pelo WebSocket que o Order Hub já tem.
 *
 * O contrato do SDK é estrutural (`addEventListener`/`removeEventListener`/`close`) e não
 * `EventSource` — foi feito exatamente para isto: o transporte é escolha do host. Migrar o
 * servidor para SSE só para satisfazer um nome de tipo seria trabalho sem ganho.
 *
 * Uma única conexão para toda a tela, contada por referência: cada painel montado assina, o
 * último a desassinar fecha o socket. Abrir uma conexão por conversa multiplicaria autenticações
 * e faria o servidor entregar o mesmo evento várias vezes.
 */

import type { ConversationEventSource, SSEProvider } from '@adatechnology/conversations-ui'
import { useAuthStore } from '@/stores/authStore'
import { WS_URL } from './apiEndpoints'

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10
const CONVERSATION_EVENT_PREFIX = 'conversation:'

type StreamListener = (event: MessageEvent) => void

interface Subscription {
  /** Ausente = stream global: recebe qualquer evento de conversa. */
  readonly conversationId?: string
  /** Por nome de evento (`message`, `mode-changed`, `data-changed`…), como no contrato do SDK. */
  readonly listeners: Map<string, Set<StreamListener>>
}

interface ServerEvent {
  type: string
  payload?: unknown
}

const subscriptions = new Set<Subscription>()
let socket: WebSocket | null = null
let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function conversationIdOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const value = (payload as Record<string, unknown>)['whatsappNumber']
  return typeof value === 'string' ? value : undefined
}

function dispatch(event: ServerEvent): void {
  if (!event.type.startsWith(CONVERSATION_EVENT_PREFIX)) return

  // O backend prefixa o tipo para separar conversas dos demais eventos do painel; o nome que o
  // SDK assina (`message`, `message-status`, `mode-changed`, `data-changed`) é o que sobra.
  const eventName = event.type.slice(CONVERSATION_EVENT_PREFIX.length)
  const conversationId = conversationIdOf(event.payload)
  // O evento carrega só o essencial; quem tem o conteúdo é a query que o assinante refaz.
  const message = new MessageEvent(eventName, { data: JSON.stringify(event) })

  for (const subscription of subscriptions) {
    if (subscription.conversationId && subscription.conversationId !== conversationId) continue
    for (const listener of subscription.listeners.get(eventName) ?? []) listener(message)
  }
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  const current = new WebSocket(WS_URL)
  socket = current

  current.onopen = () => {
    reconnectAttempts = 0
    const accessToken = useAuthStore.getState().accessToken
    if (accessToken) current.send(JSON.stringify({ type: 'auth', token: accessToken }))
  }

  current.onmessage = (event) => {
    try {
      dispatch(JSON.parse(event.data as string) as ServerEvent)
    } catch {
      // Mensagem malformada não derruba o stream.
    }
  }

  current.onclose = () => {
    if (socket === current) socket = null
    // Sem assinante não há por que reabrir — o fechamento foi intencional.
    if (subscriptions.size === 0 || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return
    reconnectAttempts += 1
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
  }

  current.onerror = () => current.close()
}

function disconnectIfIdle(): void {
  if (subscriptions.size > 0) return
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  socket = null
}

function openStream(conversationId?: string): ConversationEventSource {
  const subscription: Subscription = { conversationId, listeners: new Map() }
  subscriptions.add(subscription)
  connect()

  return {
    addEventListener: (type, listener) => {
      const existing = subscription.listeners.get(type)
      if (existing) existing.add(listener)
      else subscription.listeners.set(type, new Set([listener]))
    },
    removeEventListener: (type, listener) => {
      subscription.listeners.get(type)?.delete(listener)
    },
    close: () => {
      subscriptions.delete(subscription)
      disconnectIfIdle()
    },
  }
}

export const conversationsSdkRealtime: SSEProvider = {
  connectGlobalStream: () => openStream(),
  connectConversationStream: (conversationId) => openStream(conversationId),
}
