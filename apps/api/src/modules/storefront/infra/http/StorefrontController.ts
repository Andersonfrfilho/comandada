import { z } from 'zod'
import type { Middleware, RouteHandler } from '@/infra/http/router'
import { NotFoundError, RateLimitError, ValidationError } from '@/shared/errors/AppError'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import type { StorefrontService } from '../../application/StorefrontService'
import { STOREFRONT_ORDER_TYPES } from '../../shared/storefront.constant'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const menuQuerySchema = z.object({
  establishmentId: z.string().regex(UUID_PATTERN).optional(),
  host: z.string().max(255).optional(),
})

const quoteSchema = z
  .object({
    address: z.string().trim().min(5).max(500).optional(),
    phone: z.string().trim().min(8).max(25).optional(),
    useSavedAddress: z.boolean().optional(),
    itemsTotal: z.number().min(0).max(100000).default(0),
  })
  .refine((body) => Boolean(body.address) || (body.useSavedAddress === true && Boolean(body.phone)), {
    message: 'Informe o endereço',
    path: ['address'],
  })

const customerSchema = z.object({ phone: z.string().trim().min(8).max(25) })

const orderSchema = z.object({
  phone: z.string().trim().min(8).max(25),
  name: z.string().trim().min(2).max(120),
  orderType: z.enum(STOREFRONT_ORDER_TYPES),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().trim().max(140).optional(),
      })
    )
    .min(1)
    .max(60),
  address: z.string().trim().max(400).optional(),
  complement: z.string().trim().max(100).optional(),
  useSavedAddress: z.boolean().optional(),
  paymentMethod: z.string().min(1).max(60),
  changeFor: z.number().nonnegative().max(10000).optional(),
  notes: z.string().trim().max(500).optional(),
})

function parseOrThrow<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.infer<TSchema> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ValidationError('Confira os dados do pedido', parsed.error.flatten().fieldErrors)
  return parsed.data
}

function establishmentIdFrom(params: Record<string, string>): string {
  const establishmentId = params['establishmentId'] ?? ''
  if (!UUID_PATTERN.test(establishmentId)) throw new NotFoundError('Cardápio')
  return establishmentId
}

/** IP do cliente atrás do proxy do Railway: o primeiro do X-Forwarded-For. */
export function clientIp(headers: Record<string, string>): string {
  const forwarded = headers['x-forwarded-for']?.split(',')[0]?.trim()
  return forwarded || headers['cf-connecting-ip'] || headers['x-real-ip'] || 'anonymous'
}

/**
 * Limite por IP das rotas públicas. Redis fora do ar não derruba o cardápio: o pedido passa sem
 * contar (perder venda é pior que deixar de limitar por alguns minutos).
 */
export function storefrontRateLimit(
  cache: Pick<CacheProvider, 'increment' | 'expire' | 'ttl'>,
  options: { keyPrefix: string; windowSeconds: number; maxRequests: number }
): Middleware {
  return async (request, _response, next) => {
    const key = `rl:${options.keyPrefix}:${clientIp(request.headers)}`
    let current = 0
    try {
      current = await cache.increment(key)
      if (current === 1) await cache.expire(key, options.windowSeconds)
    } catch (error) {
      console.error('[Storefront] rate limit unavailable:', error instanceof Error ? error.message : error)
    }
    if (current > options.maxRequests) {
      const ttl = await cache.ttl(key).catch(() => options.windowSeconds)
      throw new RateLimitError(ttl > 0 ? ttl : options.windowSeconds)
    }
    await next()
  }
}

/** Cardápio online: rotas públicas, sem login. */
export class StorefrontController {
  constructor(private readonly service: Pick<StorefrontService, 'menu' | 'quoteDelivery' | 'lookupCustomer' | 'placeOrder' | 'orderStatus'>) {}

  menu: RouteHandler = async (request, response) => {
    const query = parseOrThrow(menuQuerySchema, request.query)
    response.json(await this.service.menu({ establishmentId: query.establishmentId, host: query.host }))
  }

  quoteDelivery: RouteHandler = async (request, response) => {
    const establishmentId = establishmentIdFrom(request.params)
    const body = parseOrThrow(quoteSchema, request.body)
    response.json(await this.service.quoteDelivery({ establishmentId, ...body }))
  }

  lookupCustomer: RouteHandler = async (request, response) => {
    const establishmentId = establishmentIdFrom(request.params)
    const body = parseOrThrow(customerSchema, request.body)
    response.json(await this.service.lookupCustomer({ establishmentId, phone: body.phone }))
  }

  placeOrder: RouteHandler = async (request, response) => {
    const establishmentId = establishmentIdFrom(request.params)
    const body = parseOrThrow(orderSchema, request.body)
    response.json(await this.service.placeOrder({ establishmentId, ...body }), 201)
  }

  orderStatus: RouteHandler = async (request, response) => {
    const orderId = request.params['orderId'] ?? ''
    if (!UUID_PATTERN.test(orderId)) throw new NotFoundError('Pedido')
    response.json(await this.service.orderStatus({ orderId, token: request.query['token'] ?? '' }))
  }
}
