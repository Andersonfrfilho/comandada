import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { NewDelivery } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import type { DeliveryStatus, OrderStatus } from '@/shared/types'
import { canTransitionTo } from '@/modules/orders/domain/entities/Order'
import type { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'

type Database = NodePgDatabase<typeof schema>

const STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ['dispatched'],
  dispatched: ['delivered', 'failed'],
  delivered: [],
  failed: ['pending'],
}

interface UpdateDeliveryStatusInput {
  deliveryId: string
  establishmentId: string
  newStatus: DeliveryStatus
  delivererId?: string | undefined
  userId?: string | undefined
  /** Obrigatório para "não entregue": vai para a observação da entrega. */
  note?: string | undefined
}

const CLOSED_ORDER_STATUSES: readonly OrderStatus[] = ['cancelled', 'completed']

// Entrega e pedido andam juntos: "saiu" põe o pedido em entrega e "entregue" conclui o pedido,
// e o cliente é avisado pelo mesmo caminho das mudanças feitas na cozinha.
const ORDER_STATUS_FOR_DELIVERY: Partial<Record<DeliveryStatus, OrderStatus>> = {
  dispatched: 'in_delivery',
  delivered: 'completed',
}

export class UpdateDeliveryStatusUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub: WebSocketHub,
    private readonly updateOrderStatus?: Pick<UpdateOrderStatusUseCase, 'execute'>
  ) {}

  async execute(input: UpdateDeliveryStatusInput) {
    const delivery = await this.db.query.deliveries.findFirst({
      where: and(
        eq(schema.deliveries.id, input.deliveryId),
        eq(schema.deliveries.establishmentId, input.establishmentId)
      ),
    })

    if (!delivery) throw new NotFoundError('entrega')

    const allowed = STATUS_TRANSITIONS[delivery.status]
    if (!allowed?.includes(input.newStatus)) {
      throw new UnprocessableError(MessagesConstants.delivery.invalidTransition)
    }

    // Pedido cancelado ou já concluído não sai mais para entrega nem vira "entregue".
    const order = await this.db.query.orders.findFirst({
      where: eq(schema.orders.id, delivery.orderId),
      columns: { status: true },
    })
    if (order && CLOSED_ORDER_STATUSES.includes(order.status)) {
      throw new UnprocessableError(MessagesConstants.delivery.orderClosed)
    }

    const note = input.note?.trim()
    if (input.newStatus === 'failed' && !note) {
      throw new UnprocessableError(MessagesConstants.delivery.failureReasonRequired)
    }

    const now = new Date()
    const updateValues: Partial<NewDelivery> = { status: input.newStatus }
    // Quem saiu ou entregou fica registrado: o escolhido, o já atribuído ou quem tocou no botão.
    const deliverer = input.delivererId ?? delivery.delivererId ?? input.userId
    if (input.newStatus === 'dispatched') {
      updateValues.dispatchedAt = now
      if (deliverer) updateValues.delivererId = deliverer
    } else if (input.newStatus === 'delivered') {
      updateValues.deliveredAt = now
      if (deliverer) updateValues.delivererId = deliverer
    } else if (input.newStatus === 'failed') {
      updateValues.failedAt = now
      updateValues.notes = note ?? null
    } else if (input.newStatus === 'pending') {
      updateValues.dispatchedAt = null
      updateValues.failedAt = null
    }

    const [updated] = await this.db
      .update(schema.deliveries)
      .set(updateValues)
      .where(
        and(
          eq(schema.deliveries.id, input.deliveryId),
          eq(schema.deliveries.establishmentId, input.establishmentId)
        )
      )
      .returning()

    await this.syncOrderStatus(delivery.orderId, input)

    const eventType =
      input.newStatus === 'dispatched'
        ? WS_EVENTS.DELIVERY_DISPATCHED
        : input.newStatus === 'delivered'
          ? WS_EVENTS.DELIVERY_COMPLETED
          : WS_EVENTS.DELIVERY_ASSIGNED

    await this.wsHub.publishBroadcast(input.establishmentId, eventType, {
      deliveryId: input.deliveryId,
      status: input.newStatus,
    })

    return updated!
  }

  private async syncOrderStatus(orderId: string, input: UpdateDeliveryStatusInput): Promise<void> {
    const target = ORDER_STATUS_FOR_DELIVERY[input.newStatus]
    if (!target || !this.updateOrderStatus) return
    const order = await this.db.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderId), eq(schema.orders.establishmentId, input.establishmentId)),
      columns: { status: true },
    })
    if (!order || order.status === target) return
    // Saiu antes de a cozinha marcar pronto: o pedido não volta nem pula etapas por aqui.
    if (!canTransitionTo(order.status, target)) return
    await this.updateOrderStatus.execute({
      orderId,
      establishmentId: input.establishmentId,
      newStatus: target,
      userId: input.userId,
    })
  }
}
