import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

export interface SaveBotSessionParams {
  establishmentId: string
  whatsappNumber: string
  state: string
  cart: Record<string, unknown>
  reservationDraft: Record<string, unknown>
}

export class SaveBotSessionUseCase {
  constructor(private readonly db: Database) {}

  async execute(params: SaveBotSessionParams): Promise<void> {
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
  }
}
