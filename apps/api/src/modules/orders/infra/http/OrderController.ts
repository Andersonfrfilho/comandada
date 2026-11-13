import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { CreateOrderUseCase } from '../../application/use-cases/CreateOrderUseCase'
import type { UpdateOrderStatusUseCase } from '../../application/use-cases/UpdateOrderStatusUseCase'
import type { UpdateOrderNotesUseCase } from '../../application/use-cases/UpdateOrderNotesUseCase'
import type { GetOrderUseCase } from '../../application/use-cases/GetOrderUseCase'
import type { ListOrdersUseCase } from '../../application/use-cases/ListOrdersUseCase'
import type { RequestPartialOrderConfirmationUseCase } from '../../application/use-cases/RequestPartialOrderConfirmationUseCase'
import { ValidationError, UnauthorizedError } from '@/shared/errors/AppError'
import { IfoodProvider } from '@/shared/providers/IfoodProvider'

const orderItemSchema = z.object({
  productId: z.string().uuid().optional(),
  productName: z.string().min(1).max(255),
  unitPrice: z.number().positive(),
  quantity: z.number().int().positive(),
  notes: z.string().max(500).optional(),
})

const orderPaymentSchema = z.object({
  paymentTypeName: z.string().min(1).max(50),
  amount: z.number().positive(),
  changeFor: z.number().positive().optional(),
  splitLabel: z.string().max(100).optional(),
})

const orderDeliverySchema = z.object({
  address: z.string().min(1).max(500),
  complement: z.string().max(255).optional(),
})

const createOrderSchema = z.object({
  customerId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  channel: z.enum(['whatsapp', 'ifood', 'manual']),
  type: z.enum(['delivery', 'pickup', 'table']),
  items: z.array(orderItemSchema).min(1),
  notes: z.string().max(1000).optional(),
  fiscalEnabled: z.boolean().optional(),
  whatsappMessageId: z.string().max(255).optional(),
  scheduledFor: z.string().datetime().optional(),
  payments: z.array(orderPaymentSchema).optional(),
  customerDocument: z.string().max(20).optional(),
  delivery: orderDeliverySchema.optional(),
})

const updateStatusSchema = z.object({
  status: z.enum(['received', 'in_production', 'ready', 'in_delivery', 'picked_up', 'completed', 'cancelled']),
  cancellationReason: z.string().max(500).optional(),
})

const updateNotesSchema = z.object({
  notes: z.string().max(1000).nullable(),
})

const partialConfirmationSchema = z.object({
  unavailableItemIds: z.array(z.string().uuid()).min(1),
})

const ifoodRejectSchema = z.object({
  reason: z.string().min(1).max(500),
})

interface IfoodOrderMetadata {
  ifoodOrderId: string
  ifoodDisplayId: string
  paymentMethod: string
  deliveryAddress: {
    street: string
    number: string
    neighborhood: string
    city: string
    state: string
    zip: string
  } | null
}

function extractIfoodOrderId(notes: string | null): string | null {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes) as IfoodOrderMetadata
    return parsed.ifoodOrderId ?? null
  } catch {
    return null
  }
}

function buildIfoodProvider(): IfoodProvider | null {
  const clientId = process.env.IFOOD_CLIENT_ID
  const clientSecret = process.env.IFOOD_CLIENT_SECRET
  const merchantId = process.env.IFOOD_MERCHANT_ID
  if (!clientId || !clientSecret || !merchantId) return null
  return new IfoodProvider({ clientId, clientSecret, merchantId })
}

export class OrderController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly updateStatusUseCase: UpdateOrderStatusUseCase,
    private readonly updateNotesUseCase: UpdateOrderNotesUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly requestPartialConfirmationUseCase: RequestPartialOrderConfirmationUseCase
  ) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { status, type, channel, search, dateFrom, dateTo, page, pageSize } = request.query
    const result = await this.listOrdersUseCase.execute({
      establishmentId: request.user.establishmentId,
      statuses: status ? (status.split(',') as never) : undefined,
      types: type ? (type.split(',') as never) : undefined,
      channels: channel ? (channel.split(',') as never) : undefined,
      search: search || undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    })
    response.json(result)
  }

  get: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const order = await this.getOrderUseCase.execute(
      request.params['id']!,
      request.user.establishmentId
    )
    response.json(order)
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = createOrderSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const order = await this.createOrderUseCase.execute({
      ...parsed.data,
      establishmentId: request.user.establishmentId,
      userId: request.user.id,
    })
    response.json(order, 201)
  }

  updateStatus: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = updateStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const order = await this.updateStatusUseCase.execute({
      orderId: request.params['id']!,
      establishmentId: request.user.establishmentId,
      newStatus: parsed.data.status,
      cancellationReason: parsed.data.cancellationReason,
      userId: request.user.id,
    })
    response.json(order)
  }

  updateNotes: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = updateNotesSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const order = await this.updateNotesUseCase.execute({
      orderId: request.params['id']!,
      establishmentId: request.user.establishmentId,
      notes: parsed.data.notes,
    })
    response.json(order)
  }

  /** Dispara a mensagem de confirmação parcial. Só roda por clique do atendente — nunca em fluxo automático. */
  requestPartialConfirmation: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = partialConfirmationSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const result = await this.requestPartialConfirmationUseCase.execute({
      orderId: request.params['id']!,
      establishmentId: request.user.establishmentId,
      userId: request.user.id,
      unavailableItemIds: parsed.data.unavailableItemIds,
    })
    response.json(result)
  }

  ifoodAccept: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const order = await this.getOrderUseCase.execute(
      request.params['id']!,
      request.user.establishmentId
    )

    if (order.channel !== 'ifood') {
      throw new ValidationError('Order is not from iFood')
    }

    const ifoodOrderId = extractIfoodOrderId(order.notes)
    if (!ifoodOrderId) {
      throw new ValidationError('Could not extract iFood order ID from order notes')
    }

    const provider = buildIfoodProvider()
    if (!provider) {
      throw new ValidationError('iFood integration is not configured')
    }

    await provider.acceptOrder(ifoodOrderId)

    const updated = await this.updateStatusUseCase.execute({
      orderId: order.id,
      establishmentId: request.user.establishmentId,
      newStatus: 'in_production',
      userId: request.user.id,
    })

    response.json(updated)
  }

  ifoodReject: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const parsed = ifoodRejectSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const order = await this.getOrderUseCase.execute(
      request.params['id']!,
      request.user.establishmentId
    )

    if (order.channel !== 'ifood') {
      throw new ValidationError('Order is not from iFood')
    }

    const ifoodOrderId = extractIfoodOrderId(order.notes)
    if (!ifoodOrderId) {
      throw new ValidationError('Could not extract iFood order ID from order notes')
    }

    const provider = buildIfoodProvider()
    if (!provider) {
      throw new ValidationError('iFood integration is not configured')
    }

    await provider.rejectOrder(ifoodOrderId, parsed.data.reason)

    const updated = await this.updateStatusUseCase.execute({
      orderId: order.id,
      establishmentId: request.user.establishmentId,
      newStatus: 'cancelled',
      cancellationReason: `iFood: ${parsed.data.reason}`,
    })

    response.json(updated)
  }
}
