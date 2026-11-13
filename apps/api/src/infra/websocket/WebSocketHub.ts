import { jwtVerify, type JWTPayload } from 'jose'
import type { ServerWebSocket, WebSocketHandler } from 'bun'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import { WS_EVENTS, type WsServerMessage } from './WebSocketEvents'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'change-me')
const AUTH_TIMEOUT_MS = 5000

interface AuthPayload extends JWTPayload {
  sub: string
  establishmentId: string
  role: string
}

export interface WsClientData {
  userId?: string
  establishmentId?: string
  authenticated: boolean
  authTimer?: ReturnType<typeof setTimeout>
}

function isAuthPayload(p: JWTPayload): p is AuthPayload {
  return (
    typeof p.sub === 'string' &&
    typeof (p as Record<string, unknown>)['establishmentId'] === 'string'
  )
}

function buildMessage(type: string, payload?: unknown): string {
  const msg: WsServerMessage = { type, payload, timestamp: new Date().toISOString() }
  return JSON.stringify(msg)
}

export class WebSocketHub {
  private readonly cache: CacheProvider
  // Map of establishmentId → Set of authenticated WebSocket clients
  private readonly rooms = new Map<string, Set<ServerWebSocket<WsClientData>>>()
  readonly handler: WebSocketHandler<WsClientData>

  constructor(cache: CacheProvider) {
    this.cache = cache
    this.handler = this.buildHandler()
    this.setupRedisSubscription()
  }

  private buildHandler(): WebSocketHandler<WsClientData> {
    return {
      perMessageDeflate: false,
      maxPayloadLength: 16 * 1024, // 16 KB — no large payloads needed

      open: (ws) => {
        const data = ws.data
        data.authenticated = false

        // Disconnect if no auth message received within timeout
        data.authTimer = setTimeout(() => {
          if (!data.authenticated) {
            ws.send(buildMessage(WS_EVENTS.AUTH_FAILURE, { reason: 'auth_timeout' }))
            ws.close()
          }
        }, AUTH_TIMEOUT_MS)
      },

      message: async (ws, rawMessage) => {
        const data = ws.data
        let parsed: Record<string, unknown>

        try {
          const text = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString('utf-8')
          parsed = JSON.parse(text) as Record<string, unknown>
        } catch {
          ws.send(buildMessage('error', { reason: 'invalid_json' }))
          return
        }

        if (parsed['type'] === WS_EVENTS.AUTH) {
          await this.handleAuth(ws, data, String(parsed['token'] ?? ''))
          return
        }

        if (!data.authenticated) {
          ws.send(buildMessage(WS_EVENTS.AUTH_FAILURE, { reason: 'not_authenticated' }))
          return
        }

        if (parsed['type'] === WS_EVENTS.PING) {
          ws.send(buildMessage(WS_EVENTS.PONG))
          return
        }
      },

      close: (ws) => {
        const data = ws.data
        if (data.authTimer) clearTimeout(data.authTimer)
        if (data.establishmentId) {
          const room = this.rooms.get(data.establishmentId)
          room?.delete(ws)
          if (room?.size === 0) this.rooms.delete(data.establishmentId)
        }
      },
    }
  }

  private async handleAuth(
    ws: ServerWebSocket<WsClientData>,
    data: WsClientData,
    token: string
  ): Promise<void> {
    if (!token) {
      ws.send(buildMessage(WS_EVENTS.AUTH_FAILURE, { reason: 'missing_token' }))
      ws.close()
      return
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] })
      if (!isAuthPayload(payload)) throw new Error('invalid_payload')

      if (data.authTimer) clearTimeout(data.authTimer)

      data.userId = payload.sub
      data.establishmentId = payload.establishmentId
      data.authenticated = true

      // Join room for this establishment
      const room = this.rooms.get(payload.establishmentId) ?? new Set()
      room.add(ws)
      this.rooms.set(payload.establishmentId, room)

      ws.send(buildMessage(WS_EVENTS.AUTH_SUCCESS, { userId: payload.sub }))
    } catch {
      ws.send(buildMessage(WS_EVENTS.AUTH_FAILURE, { reason: 'invalid_token' }))
      ws.close()
    }
  }

  // Broadcast to all authenticated clients in an establishment's room
  broadcast(establishmentId: string, type: string, payload?: unknown): void {
    const room = this.rooms.get(establishmentId)
    if (!room || room.size === 0) return

    const message = buildMessage(type, payload)
    for (const client of room) {
      try {
        client.send(message)
      } catch {
        // Client already disconnected
      }
    }
  }

  // Called from Redis subscription to fan out events across API instances
  private setupRedisSubscription(): void {
    void this.cache.subscribe('ws:broadcast', (rawMessage) => {
      try {
        const { establishmentId, type, payload } = JSON.parse(rawMessage) as {
          establishmentId: string
          type: string
          payload?: unknown
        }
        this.broadcast(establishmentId, type, payload)
      } catch {
        // Malformed pub/sub message
      }
    })
  }

  // Use this to broadcast from any service — Redis ensures multi-instance delivery
  async publishBroadcast(establishmentId: string, type: string, payload?: unknown): Promise<void> {
    await this.cache.publish('ws:broadcast', JSON.stringify({ establishmentId, type, payload }))
  }
}
