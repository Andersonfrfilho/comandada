import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'

const HUMAN_HANDOFF_STATE = 'human_handoff'

type Database = NodePgDatabase<typeof schema>

export interface SaveBotSessionParams {
  establishmentId: string
  whatsappNumber: string
  state: string
  cart: Record<string, unknown>
  reservationDraft: Record<string, unknown>
}

export class SaveBotSessionUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub?: Pick<WebSocketHub, 'publishBroadcast'>
  ) {}

  async execute(params: SaveBotSessionParams): Promise<void> {
    const previous = await this.db.query.botSessions.findFirst({
      where: and(
        eq(schema.botSessions.establishmentId, params.establishmentId),
        eq(schema.botSessions.whatsappNumber, params.whatsappNumber)
      ),
      columns: { state: true },
    })
    const now = new Date()
    const values = {
      state: params.state,
      cart: params.cart,
      reservationDraft: params.reservationDraft,
      lastActivityAt: now,
      updatedAt: now,
    }
    await this.db
      .insert(schema.botSessions)
      .values({ establishmentId: params.establishmentId, whatsappNumber: params.whatsappNumber, ...values })
      .onConflictDoUpdate({
        target: [schema.botSessions.establishmentId, schema.botSessions.whatsappNumber],
        set: values,
      })

    // Cliente pediu atendente: o painel toca o alerta e mostra o aviso, sem precisar estar em Conversas.
    if (params.state === HUMAN_HANDOFF_STATE && previous?.state !== HUMAN_HANDOFF_STATE && this.wsHub) {
      await this.wsHub
        .publishBroadcast(params.establishmentId, WS_EVENTS.CONVERSATION_HANDOFF_REQUESTED, { whatsappNumber: params.whatsappNumber })
        .catch(() => undefined)
    }
  }
}
