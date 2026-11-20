import type { CalculateDeliveryFeeUseCase } from '@/modules/delivery/application/use-cases/CalculateDeliveryFeeUseCase'
import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { CreateOrderUseCase } from '../../application/use-cases/CreateOrderUseCase'
import type { UpdateOrderStatusUseCase } from '../../application/use-cases/UpdateOrderStatusUseCase'
import type { UpdateOrderNotesUseCase } from '../../application/use-cases/UpdateOrderNotesUseCase'
import type { GetOrderUseCase } from '../../application/use-cases/GetOrderUseCase'
import { ORDER_SORT_FIELDS, type ListOrdersUseCase } from '../../application/use-cases/ListOrdersUseCase'
import type { RequestPartialOrderConfirmationUseCase } from '../../application/use-cases/RequestPartialOrderConfirmationUseCase'
import type { GetOrderRouteUseCase } from '../../application/use-cases/GetOrderRouteUseCase'
import type { ListOrderItemSubstitutesUseCase } from '../../application/use-cases/ListOrderItemSubstitutesUseCase'
import { ValidationError, UnauthorizedError } from '@/shared/errors/AppError'
import { orderChannelEnum, orderStatusEnum, orderTypeEnum } from '@/infra/database/schema'
import { parseAllowedList, parseDateParam, parsePageRequest, parseSortDirection, pickAllowed } from '@/shared/utils/listQuery'

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
  // Taxa conferida ou digitada pela atendente no passo do pagamento; sem ela a API calcula pela regra.
  feeAmount: z.number().min(0).max(1000).optional(),
})

const feeQuoteSchema = z.object({
  address: z.string().min(1).max(500),
  itemsTotal: z.number().min(0).optional(),
})

const createOrderSchema = z.object({
  // Id gerado no aparelho: reenvio do mesmo pedido (fila do app do garçom) não duplica.
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  comandaId: z.string().uuid().optional(),
  channel: z.enum(['whatsapp', 'ifood', 'manual']),
  type: z.enum(['delivery', 'pickup', 'table']),
  items: z.array(orderItemSchema).min(1),
  notes: z.string().max(1000).optional(),
  fiscalEnabled: z.boolean().optional(),
  whatsappMessageId: z.string().max(255).optional(),
  scheduledFor: z.string().datetime().optional(),
  payments: z.array(orderPaymentSchema).optional(),
  customerDocument: z.string().max(20).optional(),
  customerName: z.string().max(255).optional(),
  delivery: orderDeliverySchema.optional(),
})

const updateStatusSchema = z.object({
  status: z.enum(['received', 'in_production', 'ready', 'in_delivery', 'picked_up', 'completed', 'cancelled']),
  cancellationReason: z.string().max(500).optional(),
  // Detalhe do pedido: mover para qualquer status (voltar, pular etapa, reabrir).
  manual: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
})

const updateNotesSchema = z.object({
  notes: z.string().max(1000).nullable(),
})

const partialConfirmationSchema = z.object({
  unavailableItemIds: z.array(z.string().uuid()).min(1),
  substitutions: z.array(z.object({ itemId: z.string().uuid(), productId: z.string().uuid() })).optional(),
})

export class OrderController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly updateStatusUseCase: UpdateOrderStatusUseCase,
    private readonly updateNotesUseCase: UpdateOrderNotesUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly requestPartialConfirmationUseCase: RequestPartialOrderConfirmationUseCase,
    private readonly getOrderRouteUseCase?: GetOrderRouteUseCase,
    private readonly listItemSubstitutesUseCase?: ListOrderItemSubstitutesUseCase,
    private readonly calculateDeliveryFeeUseCase?: Pick<CalculateDeliveryFeeUseCase, 'quote'>
  ) {}

  /** Taxa de entrega antes de fechar o pagamento, com frete grátis e raio da regra (as do bot). */
  deliveryFeeQuote: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = feeQuoteSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Informe o endereço', parsed.error.flatten().fieldErrors)
    if (!this.calculateDeliveryFeeUseCase) {
      response.json({ feeAmount: 0, distanceKm: null, ruleConfigured: false, freeShipping: false, outOfRange: false, maxRadiusKm: null, freeAbove: null })
      return
    }
    response.json(await this.calculateDeliveryFeeUseCase.quote(parsed.data))
  }

  /** Produtos do mesmo tipo para oferecer no lugar de cada item, caso falte. */
  substitutes: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    if (!this.listItemSubstitutesUseCase) {
      response.json({ items: [] })
      return
    }
    response.json(
      await this.listItemSubstitutesUseCase.execute(request.params['id']!, request.user.establishmentId)
    )
  }

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { status, type, channel, search, dateFrom, dateTo, sortBy, sortDirection } = request.query
    const statuses = parseAllowedList(status, orderStatusEnum.enumValues)
    const types = parseAllowedList(type, orderTypeEnum.enumValues)
    const channels = parseAllowedList(channel, orderChannelEnum.enumValues)
    const { page, pageSize } = parsePageRequest(request.query)
    const result = await this.listOrdersUseCase.execute({
      establishmentId: request.user.establishmentId,
      statuses: statuses.length ? statuses : undefined,
      types: types.length ? types : undefined,
      channels: channels.length ? channels : undefined,
      search: search?.trim() || undefined,
      dateFrom: parseDateParam(dateFrom),
      dateTo: parseDateParam(dateTo, true),
      page,
      pageSize,
      sortBy: pickAllowed(sortBy, ORDER_SORT_FIELDS),
      sortDirection: parseSortDirection(sortDirection),
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

  /** Distância, tempo e coordenadas do restaurante até o endereço de entrega (mapa do detalhe do pedido). */
  route: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    if (!this.getOrderRouteUseCase) {
      response.json({ origin: null, destination: null, distanceKm: null, durationMin: null, source: null })
      return
    }
    const route = await this.getOrderRouteUseCase.execute(request.params['id']!, request.user.establishmentId)
    response.json(route)
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
      priceFromCatalog: true,
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
      manual: parsed.data.manual,
      note: parsed.data.note,
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
      substitutions: parsed.data.substitutions,
    })
    response.json(result)
  }
}
