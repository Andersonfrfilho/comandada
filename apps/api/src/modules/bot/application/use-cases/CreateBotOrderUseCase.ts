import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import { ValidationError } from '@/shared/errors/AppError'
import type { BookScheduledOrderUseCase } from '@/modules/agenda/application/use-cases/BookScheduledOrderUseCase'
import type { CancelScheduleBookingUseCase } from '@/modules/agenda/application/use-cases/CancelScheduleBookingUseCase'
import { SCHEDULING_ACTOR_BOT } from '@/modules/agenda/shared/agenda.constant'
import type { EstimateOrderTimeUseCase } from '@/modules/orders/application/use-cases/EstimateOrderTimeUseCase'
import type { BotCustomerService } from '../services/BotCustomerService'
import { BOT_ORDER_TYPE_TO_API } from '../../shared/bot.constant'
import type { CreateOrderChargeUseCase, OrderChargeResult } from '@/modules/payments/application/use-cases/CreateOrderChargeUseCase'
import { ONLINE_CHARGE_KIND_BY_METHOD } from '@/modules/payments/shared/payments.constant'

type Database = NodePgDatabase<typeof schema>

export interface BotOrderItemParams {
  productId: string
  quantity: number
  // Observação do cliente para a cozinha ("sem cebola").
  notes?: string | undefined
}

export interface BotPaymentLegParams {
  method: string
  amount: number
  changeFor?: number | undefined
  splitLabel?: string | undefined
}

export interface CreateBotOrderParams {
  establishmentId: string
  whatsappNumber: string
  customerName?: string | undefined
  code: string
  orderType: string
  items: BotOrderItemParams[]
  paymentMethod: string
  changeFor?: number | undefined
  payments?: BotPaymentLegParams[] | undefined
  deliveryFee?: number | undefined
  address?: string | undefined
  mapsLink?: string | undefined
  // Encomenda: ISO instant the customer picked; absent means "para agora".
  scheduledFor?: string | undefined
}

export interface BotScheduleBooking {
  readonly book: Pick<BookScheduledOrderUseCase, 'execute'>
  readonly cancel: Pick<CancelScheduleBookingUseCase, 'execute'>
}

export interface CreateBotOrderResult {
  id: string
  code: string
  // Absent when the estimate could not be computed; the order is saved either way.
  estimatedAt?: string | undefined
  estimatedMinutes?: number | undefined
  // Pagamento online (Pix/link) gerado na conta do restaurante; o bot manda no chat.
  payment?: OrderChargeResult | undefined
}

export class CreateBotOrderUseCase {
  constructor(
    private readonly db: Database,
    private readonly customerService: BotCustomerService,
    private readonly createOrderUseCase: Pick<CreateOrderUseCase, 'execute'>,
    private readonly scheduleBooking: BotScheduleBooking,
    private readonly estimateOrderTime: Pick<EstimateOrderTimeUseCase, 'execute'>,
    private readonly orderCharges?: Pick<CreateOrderChargeUseCase, 'execute'>
  ) {}

  async execute(params: CreateBotOrderParams): Promise<CreateBotOrderResult> {
    const type = BOT_ORDER_TYPE_TO_API[params.orderType]
    if (!type) throw new ValidationError('Unknown order type', { orderType: [params.orderType] })

    const items = await this.priceItems(params.establishmentId, params.items)
    const deliveryFee = type === 'delivery' ? (params.deliveryFee ?? 0) : 0
    const customer = await this.customerService.findOrCreate({
      establishmentId: params.establishmentId,
      whatsappNumber: params.whatsappNumber,
      name: params.customerName,
    })

    // The slot is taken before the order exists: a full slot must refuse the order, not overbook.
    const scheduledFor = params.scheduledFor ? new Date(params.scheduledFor) : undefined
    const booking = scheduledFor
      ? await this.scheduleBooking.book.execute({
          establishmentId: params.establishmentId,
          scheduledFor,
          orderCode: params.code,
          customerRef: customer.id,
          now: new Date(),
        })
      : undefined

    let orderId: string
    try {
      const order = await this.createOrderUseCase.execute({
        establishmentId: params.establishmentId,
        customerId: customer.id,
        channel: 'whatsapp',
        type,
        items,
        payments: buildPayments({ params, items, deliveryFee }),
        notes: params.mapsLink ? `Localização: ${params.mapsLink}` : undefined,
        delivery: type === 'delivery' && params.address ? { address: params.address, feeAmount: deliveryFee } : undefined,
        scheduledFor: scheduledFor?.toISOString(),
      })
      orderId = order.id
    } catch (error) {
      if (booking) await this.releaseSlot({ establishmentId: params.establishmentId, bookingId: booking.bookingId })
      throw error
    }

    const estimate = await this.estimateOrderTime
      .execute({
        establishmentId: params.establishmentId,
        type,
        productIds: items.map((item) => item.productId),
        scheduledFor,
        now: new Date(),
      })
      .catch((error: unknown) => {
        console.error('[Bot] order estimate failed:', error instanceof Error ? error.message : error)
        return undefined
      })
    await this.db
      .update(schema.orders)
      .set({ code: params.code, scheduleBookingId: booking?.bookingId ?? null, estimatedAt: estimate?.estimatedAt ?? null })
      .where(eq(schema.orders.id, orderId))
    const payment = await this.createOnlineCharge({ params, orderId, total: orderTotal(items, deliveryFee) })
    return {
      id: orderId,
      code: params.code,
      estimatedAt: estimate?.estimatedAt.toISOString(),
      estimatedMinutes: estimate?.minutes,
      payment,
    }
  }

  // Só pagamento de uma parte vira cobrança online: divisão e misto continuam na entrega/retirada.
  private async createOnlineCharge(input: {
    params: CreateBotOrderParams
    orderId: string
    total: number
  }): Promise<OrderChargeResult | undefined> {
    if (!this.orderCharges) return undefined
    const legs = input.params.payments ?? []
    if (legs.length > 1) return undefined
    const method = legs[0]?.method ?? input.params.paymentMethod
    const kind = ONLINE_CHARGE_KIND_BY_METHOD[method]
    if (!kind) return undefined
    return this.orderCharges.execute({
      establishmentId: input.params.establishmentId,
      orderId: input.orderId,
      orderCode: input.params.code,
      kind,
      amount: input.total,
      now: new Date(),
    })
  }

  private async releaseSlot(params: { establishmentId: string; bookingId: string }): Promise<void> {
    await this.scheduleBooking.cancel.execute({
      ...params,
      cancelledBy: SCHEDULING_ACTOR_BOT,
      reason: 'order_not_created',
    })
  }

  // Prices come from the catalog, never from the message payload.
  private async priceItems(establishmentId: string, items: BotOrderItemParams[]) {
    const products = await this.db.query.products.findMany({
      where: and(
        eq(schema.products.establishmentId, establishmentId),
        inArray(
          schema.products.id,
          items.map((item) => item.productId)
        )
      ),
    })
    const productById = new Map(products.map((product) => [product.id, product]))
    const missing = items.filter((item) => !productById.get(item.productId)?.active)
    if (missing.length > 0) {
      throw new ValidationError('Products unavailable', { productIds: missing.map((item) => item.productId) })
    }
    return items.map((item) => {
      const product = productById.get(item.productId) as schema.Product
      return {
        productId: product.id,
        productName: product.name,
        unitPrice: Number(product.price),
        quantity: item.quantity,
        notes: item.notes?.trim() || undefined,
      }
    })
  }
}

interface BuildPaymentsInput {
  params: CreateBotOrderParams
  items: Array<{ unitPrice: number; quantity: number }>
  deliveryFee: number
}

function orderTotal(items: Array<{ unitPrice: number; quantity: number }>, deliveryFee: number): number {
  return roundCents(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) + deliveryFee)
}

// The catalog decides the total; the legs keep the customer's split and the last one absorbs any rounding.
function buildPayments(input: BuildPaymentsInput) {
  const itemsTotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const total = roundCents(itemsTotal + input.deliveryFee)
  const legs = input.params.payments ?? []
  if (legs.length === 0) {
    return [{ paymentTypeName: input.params.paymentMethod, amount: total, changeFor: input.params.changeFor }]
  }
  const leading = legs.slice(0, -1).map((leg) => roundCents(leg.amount))
  const leadingSum = leading.reduce((sum, amount) => sum + amount, 0)
  const amounts = leadingSum < total ? [...leading, roundCents(total - leadingSum)] : evenSplit(total, legs.length)
  return legs.map((leg, index) => ({
    paymentTypeName: leg.method,
    amount: amounts[index] ?? 0,
    changeFor: leg.changeFor,
    splitLabel: leg.splitLabel,
  }))
}

function evenSplit(total: number, parts: number): number[] {
  const share = roundCents(total / parts)
  return Array.from({ length: parts }, (_, index) => (index === parts - 1 ? roundCents(total - share * (parts - 1)) : share))
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}
