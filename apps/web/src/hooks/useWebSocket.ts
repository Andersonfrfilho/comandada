import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { WS_URL } from '@/lib/apiEndpoints'

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

interface WsMessage {
  type: string
  payload?: unknown
  timestamp?: string
}

type MessageHandler = (message: WsMessage) => void

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const accessToken = useAuthStore((state) => state.accessToken)
  const refresh = useAuthStore((state) => state.refresh)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0
      if (accessToken) {
        ws.send(JSON.stringify({ type: 'auth', token: accessToken }))
      }
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as WsMessage
        if (message.type === 'auth:failure') {
          // Try silent token refresh then reconnect
          void refresh().then((success) => {
            if (success) {
              ws.close()
            }
          })
          return
        }
        onMessageRef.current(message)
      } catch {
        // Malformed message
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [accessToken, refresh])

  useEffect(() => {
    if (accessToken) {
      connect()
    }

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect, accessToken])
}
