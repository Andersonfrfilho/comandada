import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalDocument } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { createAndEnqueueFiscalDocument } from '../FiscalEmissionEnqueue'
import { fiscalTotalOf } from '../fiscalTotal'

type Database = NodePgDatabase<typeof schema>

export type FiscalTriggerEvent = 'on_payment' | 'on_completed'

type TriggerFiscalEmissionParams = {
  readonly orderId: string
  readonly establishmentId: string
  readonly event: FiscalTriggerEvent
}

// Automatic emission entry point. Called as a side effect of a payment or an order completion.
// It is a no-op unless the order opted in AND the establishment's configured trigger matches the
// event — so it never emits by surprise and never duplicates an existing document.
export class TriggerFiscalEmissionUseCase {
  constructor(
    private readonly database: Database,
    private readonly websocketHub: WebSocketHub
  ) {}

  async execute(params: TriggerFiscalEmissionParams): Promise<void> {
    const { orderId, establishmentId, event } = params

    const order = await this.database.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderId), eq(schema.orders.establishmentId, establishmentId)),
    })
    if (!order || !order.fiscalEnabled) return

    const config = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
    })
    if (!config || config.model === 'none' || !config.active) return
    if (config.emitTrigger !== event) return

    const existing = await this.database.query.fiscalDocuments.findFirst({
      where: eq(schema.fiscalDocuments.orderId, orderId),
    })
    if (existing) return

    await createAndEnqueueFiscalDocument({
      database: this.database,
      websocketHub: this.websocketHub,
      establishmentId,
      orderId,
      model: config.model as FiscalDocument['model'],
      totalAmount: fiscalTotalOf(order).toFixed(2),
    })
  }
}
