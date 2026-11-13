import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import type { BotCustomerService } from '@/modules/bot/application/services/BotCustomerService'
import { ORDER_ISSUE_CHANNEL_WHATSAPP, type OrderIssueCategory } from '../../shared/issues.constant'

type Database = NodePgDatabase<typeof schema>

export interface CreateOrderIssueParams {
  readonly establishmentId: string
  readonly whatsappNumber: string
  readonly category: OrderIssueCategory
  readonly orderCode?: string | undefined
  readonly description?: string | undefined
}

export interface CreateOrderIssueResult {
  readonly id: string
  readonly orderId: string | null
}

export class CreateOrderIssueUseCase {
  constructor(
    private readonly db: Database,
    private readonly customerService: Pick<BotCustomerService, 'findOrCreate'>,
    private readonly wsHub: Pick<WebSocketHub, 'publishBroadcast'>
  ) {}

  async execute(params: CreateOrderIssueParams): Promise<CreateOrderIssueResult> {
    const customer = await this.customerService.findOrCreate({
      establishmentId: params.establishmentId,
      whatsappNumber: params.whatsappNumber,
    })
    // O código é o que o cliente viu; só vale se o pedido for dele, neste estabelecimento.
    const order = params.orderCode
      ? await this.db.query.orders.findFirst({
          where: and(
            eq(schema.orders.establishmentId, params.establishmentId),
            eq(schema.orders.customerId, customer.id),
            eq(schema.orders.code, params.orderCode)
          ),
          orderBy: desc(schema.orders.createdAt),
          columns: { id: true },
        })
      : undefined

    const [issue] = await this.db
      .insert(schema.orderIssues)
      .values({
        establishmentId: params.establishmentId,
        orderId: order?.id ?? null,
        customerId: customer.id,
        category: params.category,
        description: params.description ?? null,
        channel: ORDER_ISSUE_CHANNEL_WHATSAPP,
      })
      .returning({ id: schema.orderIssues.id, orderId: schema.orderIssues.orderId })

    await this.wsHub.publishBroadcast(params.establishmentId, WS_EVENTS.ORDER_ISSUE_REPORTED, {
      issueId: issue!.id,
      orderId: issue!.orderId,
      category: params.category,
    })
    return { id: issue!.id, orderId: issue!.orderId }
  }
}
