import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import { ValidationError } from '@/shared/errors/AppError'
import type { GetBotContextUseCase } from '../../application/use-cases/GetBotContextUseCase'
import type { SaveBotSessionUseCase } from '../../application/use-cases/SaveBotSessionUseCase'
import type { CreateBotOrderUseCase } from '../../application/use-cases/CreateBotOrderUseCase'
import type { CreateBotReservationUseCase } from '../../application/use-cases/CreateBotReservationUseCase'
import type { BotCustomerService } from '../../application/services/BotCustomerService'
import type { CreateOrderIssueUseCase } from '@/modules/issues/application/use-cases/CreateOrderIssueUseCase'
import type { AnswerPartialConfirmationUseCase } from '@/modules/orders/application/use-cases/AnswerPartialConfirmationUseCase'
import { ORDER_ISSUE_CATEGORIES } from '@/modules/issues/shared/issues.constant'

const whatsappNumberSchema = z.string().regex(/^\d{8,15}$/)

const partialAnswerSchema = z.object({ establishmentId: z.string().uuid(), accept: z.boolean() })

const contextQuerySchema = z.object({ instance: z.string().max(40).optional() })

const sessionSchema = z.object({
  establishmentId: z.string().uuid(),
  state: z.string().min(1).max(50),
  cart: z.record(z.unknown()).default({}),
  reservationDraft: z.record(z.unknown()).default({}),
})

const orderSchema = z.object({
  establishmentId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(255).optional(),
  code: z.string().trim().min(1).max(40),
  orderType: z.string().min(1).max(30),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().max(140).optional(),
      })
    )
    .min(1),
  paymentMethod: z.string().min(1).max(60),
  changeFor: z.number().nonnegative().optional(),
  payments: z
    .array(
      z.object({
        method: z.string().min(1).max(50),
        amount: z.number().nonnegative(),
        changeFor: z.number().nonnegative().optional(),
        splitLabel: z.string().max(100).optional(),
      })
    )
    .max(20)
    .optional(),
  deliveryFee: z.number().nonnegative().max(500).optional(),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
  address: z.string().trim().max(500).optional(),
  mapsLink: z.string().trim().max(500).optional(),
})

const reservationSchema = z.object({
  establishmentId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(255).optional(),
  code: z.string().trim().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.number().int().min(1).max(50),
})

const customerSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
})

const issueSchema = z.object({
  establishmentId: z.string().uuid(),
  category: z.enum(ORDER_ISSUE_CATEGORIES),
  orderCode: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
})

function parseOrThrow<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.infer<TSchema> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
  return parsed.data
}

// Internal routes for the n8n bot, behind internalAuth: the tenant comes in the request body.
export class BotController {
  constructor(
    private readonly getContextUseCase: GetBotContextUseCase,
    private readonly saveSessionUseCase: SaveBotSessionUseCase,
    private readonly createOrderUseCase: CreateBotOrderUseCase,
    private readonly customerService: BotCustomerService,
    private readonly createReservationUseCase: CreateBotReservationUseCase,
    private readonly createIssueUseCase: Pick<CreateOrderIssueUseCase, 'execute'>,
    private readonly answerPartialConfirmationUseCase: Pick<AnswerPartialConfirmationUseCase, 'execute'>
  ) {}

  context: RouteHandler = async (request, response) => {
    const whatsappNumber = parseOrThrow(whatsappNumberSchema, request.params['whatsapp'])
    const { instance } = parseOrThrow(contextQuerySchema, request.query)
    response.json(await this.getContextUseCase.execute({ whatsappNumber, instance }))
  }

  saveSession: RouteHandler = async (request, response) => {
    const whatsappNumber = parseOrThrow(whatsappNumberSchema, request.params['whatsapp'])
    const body = parseOrThrow(sessionSchema, request.body)
    await this.saveSessionUseCase.execute({ whatsappNumber, ...body })
    response.json({ saved: true })
  }

  createOrder: RouteHandler = async (request, response) => {
    const whatsappNumber = parseOrThrow(whatsappNumberSchema, request.params['whatsapp'])
    const body = parseOrThrow(orderSchema, request.body)
    response.json(await this.createOrderUseCase.execute({ whatsappNumber, ...body }), 201)
  }

  createReservation: RouteHandler = async (request, response) => {
    const whatsappNumber = parseOrThrow(whatsappNumberSchema, request.params['whatsapp'])
    const body = parseOrThrow(reservationSchema, request.body)
    response.json(await this.createReservationUseCase.execute({ whatsappNumber, ...body }), 201)
  }

  createIssue: RouteHandler = async (request, response) => {
    const whatsappNumber = parseOrThrow(whatsappNumberSchema, request.params['whatsapp'])
    const body = parseOrThrow(issueSchema, request.body)
    response.json(await this.createIssueUseCase.execute({ whatsappNumber, ...body }), 201)
  }

  answerPartialConfirmation: RouteHandler = async (request, response) => {
    const whatsappNumber = parseOrThrow(whatsappNumberSchema, request.params['whatsapp'])
    const body = parseOrThrow(partialAnswerSchema, request.body)
    response.json(await this.answerPartialConfirmationUseCase.execute({ whatsappNumber, ...body }))
  }

  updateCustomer: RouteHandler = async (request, response) => {
    const whatsappNumber = parseOrThrow(whatsappNumberSchema, request.params['whatsapp'])
    const body = parseOrThrow(customerSchema, request.body)
    const customer = await this.customerService.findOrCreate({
      establishmentId: body.establishmentId,
      whatsappNumber,
      name: body.name,
    })
    response.json({ id: customer.id, name: customer.name })
  }
}
