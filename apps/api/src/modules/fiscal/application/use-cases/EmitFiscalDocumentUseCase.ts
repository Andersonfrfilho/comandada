import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalDocument } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { NotFoundError, ConflictError, UnprocessableError } from '@/shared/errors/AppError'
import { createAndEnqueueFiscalDocument } from '../FiscalEmissionEnqueue'
import { fiscalTotalOf } from '../fiscalTotal'

type Database = NodePgDatabase<typeof schema>

export class EmitFiscalDocumentUseCase {
  constructor(
    private readonly database: Database,
    private readonly websocketHub: WebSocketHub
  ) {}

  async execute(params: { orderId: string; establishmentId: string }): Promise<FiscalDocument> {
    const { orderId, establishmentId } = params

    const order = await this.database.query.orders.findFirst({
      where: and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.establishmentId, establishmentId)
      ),
    })
    if (!order) throw new NotFoundError('Order')
    if (order.status !== 'completed') {
      throw new UnprocessableError('Order must be completed to emit fiscal document')
    }

    const existingDocument = await this.database.query.fiscalDocuments.findFirst({
      where: eq(schema.fiscalDocuments.orderId, orderId),
    })
    if (existingDocument) throw new ConflictError('Fiscal document already exists for this order')

    const fiscalConfig = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
    })
    if (!fiscalConfig || fiscalConfig.model === 'none' || !fiscalConfig.active) {
      throw new UnprocessableError('Fiscal configuration not active for this establishment')
    }

    return createAndEnqueueFiscalDocument({
      database: this.database,
      websocketHub: this.websocketHub,
      establishmentId,
      orderId,
      model: fiscalConfig.model as FiscalDocument['model'],
      totalAmount: fiscalTotalOf(order).toFixed(2),
    })
  }
}
