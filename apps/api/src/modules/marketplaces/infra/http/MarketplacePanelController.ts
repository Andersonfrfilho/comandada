import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import { AppError, UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import { MARKETPLACE_LABELS, MARKETPLACE_PLATFORMS, MarketplaceApiError, type MarketplacePlatform } from '../../domain/Marketplace'
import type { MarketplaceOrderService } from '../../application/MarketplaceOrderService'

const cancelSchema = z.object({
  code: z.string().trim().min(1).max(60),
  reason: z.string().trim().min(3).max(250),
})

const disputeResponseSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('accept'), reason: z.string().trim().max(250).optional() }),
  z.object({ decision: z.literal('reject'), reason: z.string().trim().min(3).max(250) }),
  z.object({
    decision: z.literal('alternative'),
    alternativeId: z.string().trim().min(1).max(120),
    amount: z.number().positive().max(100_000).optional(),
    minutes: z.number().int().positive().max(240).optional(),
    reason: z.string().trim().max(250).optional(),
  }),
])

const platformSchema = z.enum(MARKETPLACE_PLATFORMS as unknown as [MarketplacePlatform, ...MarketplacePlatform[]])
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const rangeSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  platform: platformSchema.optional(),
})

const reviewsQuerySchema = z.object({
  platform: platformSchema.default('ifood'),
  merchantId: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
})

const answerSchema = z.object({
  platform: platformSchema.default('ifood'),
  merchantId: z.string().trim().max(100).optional(),
  text: z.string().trim().min(10).max(300),
})

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const parsed = schema.safeParse(value ?? {})
  if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten())
  return parsed.data
}

/**
 * Erro da plataforma vira 502 com mensagem para a tela (a equipe tenta de novo ou resolve no portal).
 * Os detalhes ficam no log.
 */
async function platformCall<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof MarketplaceApiError) {
      console.error(`[Marketplaces] ${error.message}`)
      throw new AppError(
        `O ${MARKETPLACE_LABELS[error.platform]} não aceitou agora (${error.status}). Tente de novo ou resolva no portal da plataforma.`,
        'marketplace_platform_error',
        502
      )
    }
    throw error
  }
}

/** Rotas do painel: pedido da plataforma, negociações, financeiro e avaliações. */
export class MarketplacePanelController {
  constructor(private readonly service: MarketplaceOrderService) {}

  overview: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const establishmentId = request.user.establishmentId
    response.json({
      platforms: this.service.platformsFor(establishmentId).map((platform) => ({
        platform,
        label: MARKETPLACE_LABELS[platform],
        financial: Boolean(this.service.connection(platform)?.provider.financial),
        reviews: Boolean(this.service.connection(platform)?.provider.reviews),
      })),
      reviewPlatforms: this.service.reviewPlatforms(establishmentId),
    })
  }

  order: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    response.json({ marketplace: await this.service.orderView(request.user.establishmentId, request.params['orderId']!) })
  }

  cancellationReasons: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const reasons = await platformCall(() =>
      this.service.cancellationReasons(request.user!.establishmentId, request.params['orderId']!)
    )
    response.json({ reasons })
  }

  cancel: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const body = parse(cancelSchema, request.body)
    await platformCall(() => this.service.cancelOnPlatform(request.user!.establishmentId, request.params['orderId']!, body))
    response.json({ requested: true }, 202)
  }

  disputes: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const openOnly = request.query['status'] === 'open'
    response.json({ disputes: await this.service.listDisputes(request.user.establishmentId, { openOnly }) })
  }

  respondDispute: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const body = parse(disputeResponseSchema, request.body)
    const dispute = await platformCall(() =>
      this.service.respondDispute(request.user!.establishmentId, request.params['id']!, body, request.user!.id)
    )
    response.json({ dispute })
  }

  sales: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const query = parse(rangeSchema, request.query)
    response.json(await this.service.financialSales(request.user.establishmentId, query, query.platform))
  }

  settlements: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const query = parse(rangeSchema, request.query)
    response.json(await this.service.financialSettlements(request.user.establishmentId, query, query.platform))
  }

  reviews: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const query = parse(reviewsQuerySchema, request.query)
    const page = await platformCall(() => this.service.listReviews(request.user!.establishmentId, query.platform, query))
    response.json(page)
  }

  reviewSummary: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const query = parse(reviewsQuerySchema.pick({ platform: true, merchantId: true }), request.query)
    response.json(await platformCall(() => this.service.reviewSummary(request.user!.establishmentId, query.platform, query.merchantId)))
  }

  answerReview: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const body = parse(answerSchema, request.body)
    await platformCall(() =>
      this.service.answerReview(request.user!.establishmentId, body.platform, request.params['id']!, body.text, body.merchantId)
    )
    response.json({ answered: true }, 201)
  }
}
