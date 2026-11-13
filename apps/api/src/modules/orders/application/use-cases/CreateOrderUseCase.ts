import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { ConflictError } from '@/shared/errors/AppError'
import type { OrderType, OrderChannel } from '@/shared/types'
import type { CalculateDeliveryFeeUseCase } from '@/modules/delivery/application/use-cases/CalculateDeliveryFeeUseCase'

type Database = NodePgDatabase<typeof schema>

interface CreateOrderItemInput {
  productId?: string | undefined
  productName: string
  unitPrice: number
  quantity: number
  notes?: string | undefined
}

interface CreateOrderPaymentInput {
  paymentTypeName: string
  amount: number
  changeFor?: number | undefined
  splitLabel?: string | undefined
}

interface CreateOrderDeliveryInput {
  address: string
  complement?: string | undefined
  // Fee already quoted to the customer (WhatsApp bot); when absent the API calculates it.
  feeAmount?: number | undefined
}

interface CreateOrderInput {
  establishmentId: string
  customerId?: string | undefined
  tableId?: string | undefined
  channel: OrderChannel
  type: OrderType
  items: CreateOrderItemInput[]
  notes?: string | undefined
  fiscalEnabled?: boolean | undefined
  whatsappMessageId?: string | undefined
  scheduledFor?: string | undefined
  payments?: CreateOrderPaymentInput[] | undefined
  customerDocument?: string | undefined
  delivery?: CreateOrderDeliveryInput | undefined
  // Quem lançou o pedido no painel; ausente para WhatsApp e iFood.
  userId?: string | undefined
}

export class CreateOrderUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub: WebSocketHub,
    private readonly calculateDeliveryFeeUseCase?: CalculateDeliveryFeeUseCase
  ) {}

  async execute(input: CreateOrderInput) {
    // Idempotency: skip duplicate webhook deliveries
    if (input.whatsappMessageId) {
      const duplicate = await this.db.query.orders.findFirst({
        where: eq(schema.orders.whatsappMessageId, input.whatsappMessageId),
      })
      if (duplicate) return duplicate
    }

    if (input.items.length === 0) {
      throw new ConflictError('Order must have at least one item')
    }

    const itemsTotal = input.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )

    // Taxa antes do pedido: o total gravado é o que o cliente paga (itens + entrega).
    const feeResult = input.type === 'delivery' && input.delivery
      ? input.delivery.feeAmount !== undefined
        ? { feeAmount: input.delivery.feeAmount, distanceKm: null }
        : this.calculateDeliveryFeeUseCase
          ? await this.calculateDeliveryFeeUseCase.execute({ address: input.delivery.address })
          : { feeAmount: 0, distanceKm: null }
      : null
    const deliveryFee = feeResult?.feeAmount ?? 0
    const totalAmount = Math.round((itemsTotal + deliveryFee) * 100) / 100

    const [order] = await this.db
      .insert(schema.orders)
      .values({
        establishmentId: input.establishmentId,
        customerId: input.customerId ?? null,
        tableId: input.tableId ?? null,
        channel: input.channel,
        type: input.type,
        status: 'received',
        totalAmount: totalAmount.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        notes: input.notes ?? null,
        fiscalEnabled: input.fiscalEnabled ?? true,
        whatsappMessageId: input.whatsappMessageId ?? null,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      })
      .returning()

    if (!order) throw new ConflictError('Failed to create order')

    const itemValues = input.items.map((item) => ({
      orderId: order.id,
      productId: item.productId ?? null,
      productName: item.productName,
      unitPrice: item.unitPrice.toFixed(2),
      quantity: item.quantity,
      totalPrice: (item.unitPrice * item.quantity).toFixed(2),
      notes: item.notes ?? null,
    }))

    await this.db.insert(schema.orderItems).values(itemValues)

    // Primeira linha do histórico de status: o pedido chegou.
    await this.db.insert(schema.orderStatusLogs).values({
      orderId: order.id,
      establishmentId: input.establishmentId,
      status: 'received',
      previousStatus: null,
      changedByUserId: input.userId ?? null,
      createdAt: order.receivedAt,
      updatedAt: order.receivedAt,
    })

    if (input.payments && input.payments.length > 0) {
      const paymentValues = input.payments.map((payment) => ({
        orderId: order.id,
        paymentTypeName: payment.paymentTypeName,
        amount: payment.amount.toFixed(2),
        changeFor: payment.changeFor !== undefined ? payment.changeFor.toFixed(2) : null,
        splitLabel: payment.splitLabel ?? null,
      }))
      await this.db.insert(schema.orderPayments).values(paymentValues)
    }

    // Documento só atualiza cliente já existente e sem documento — nunca sobrescreve um já
    // cadastrado, para não perder dado correto por erro de digitação num pedido novo.
    if (input.customerId && input.customerDocument) {
      const customer = await this.db.query.customers.findFirst({
        where: eq(schema.customers.id, input.customerId),
      })
      if (customer && !customer.document) {
        await this.db
          .update(schema.customers)
          .set({ document: input.customerDocument })
          .where(eq(schema.customers.id, input.customerId))
      }
    }

    if (input.type === 'delivery' && input.delivery && feeResult) {
      await this.db.insert(schema.deliveries).values({
        orderId: order.id,
        establishmentId: input.establishmentId,
        status: 'pending',
        addressSnapshot: {
          address: input.delivery.address,
          complement: input.delivery.complement ?? null,
        },
        feeAmount: feeResult.feeAmount.toFixed(2),
        distanceKm: feeResult.distanceKm !== null ? feeResult.distanceKm.toFixed(2) : null,
      })
    }

    // Broadcast to all connected clients in this establishment
    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.ORDER_CREATED, {
      orderId: order.id,
      type: order.type,
      channel: order.channel,
      status: order.status,
      totalAmount: order.totalAmount,
    })

    return order
  }
}
