import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import * as schema from '@/infra/database/schema'
import type { CustomerMessageProvider } from '@/shared/providers/CustomerMessageProvider'
import type { OrderStatus, OrderType } from '@/shared/types'
import { ORDER_STATUS_CUSTOMER_MESSAGES, ORDER_STATUS_TEMPLATE_TEXTS } from '../../shared/orders.constant'

type Database = NodePgDatabase<typeof schema>

export interface NotifyOrderStatusParams {
  readonly orderId: string
  readonly establishmentId: string
  readonly newStatus: OrderStatus
  readonly agentUserId: string
}

type StatusMessageKey = keyof typeof ORDER_STATUS_CUSTOMER_MESSAGES

function statusMessageKey(status: OrderStatus, type: OrderType): StatusMessageKey | undefined {
  if (status === 'in_production' || status === 'in_delivery' || status === 'cancelled') return status
  // Entregue: só o delivery recebe; retirada e mesa já foram avisados no "pronto".
  if (status === 'completed') return type === 'delivery' ? 'delivered' : undefined
  if (status !== 'ready') return undefined
  if (type === 'pickup') return 'ready_pickup'
  if (type === 'table') return 'ready_table'
  return undefined
}

export function buildOrderStatusMessage(params: { status: OrderStatus; type: OrderType; code: string }): string | undefined {
  const key = statusMessageKey(params.status, params.type)
  return key ? ORDER_STATUS_CUSTOMER_MESSAGES[key](params.code) : undefined
}

export function buildOrderStatusTemplateText(params: { status: OrderStatus; type: OrderType }): string | undefined {
  const key = statusMessageKey(params.status, params.type)
  return key ? ORDER_STATUS_TEMPLATE_TEXTS[key] : undefined
}

// Only WhatsApp orders are told: the customer is waiting in that chat, and other channels notify on their own.
export class NotifyOrderStatusUseCase {
  constructor(
    private readonly db: Database,
    private readonly customerMessages: CustomerMessageProvider
  ) {}

  async execute(params: NotifyOrderStatusParams): Promise<void> {
    const order = await this.db.query.orders.findFirst({
      where: eq(schema.orders.id, params.orderId),
      with: { customer: true },
    })
    if (!order || order.channel !== 'whatsapp' || order.establishmentId !== params.establishmentId) return
    const whatsappNumber = order.customer?.whatsappNumber
    const code = order.code ?? order.id.slice(0, 8).toUpperCase()
    const body = buildOrderStatusMessage({ status: params.newStatus, type: order.type, code })
    const templateText = buildOrderStatusTemplateText({ status: params.newStatus, type: order.type })
    if (!whatsappNumber || !body) return
    await this.customerMessages.sendText({
      establishmentId: params.establishmentId,
      whatsappNumber,
      body,
      agentUserId: params.agentUserId,
      outsideWindow: templateText ? { parameters: [code, templateText] } : undefined,
    })
  }
}
