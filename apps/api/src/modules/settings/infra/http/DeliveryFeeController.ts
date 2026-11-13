import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError, ValidationError, NotFoundError } from '@/shared/errors/AppError'
import { db } from '@/infra/database/connection'
import { deliveryFeeRules } from '@/infra/database/schema/delivery-fee-rules'
import { deliveryFeeZones } from '@/infra/database/schema/delivery-fee-zones'
import { eq, and, isNull } from 'drizzle-orm'

const createRuleSchema = z.object({
  orderTypeId: z.number().int().positive(),
  mode: z.enum(['fixed', 'per_km', 'per_route_min', 'zones_km', 'zones_min']).default('fixed'),
  baseFee: z.number().min(0).default(0),
  perKmRate: z.number().min(0).default(0),
  perMinRate: z.number().min(0).default(0),
  freeAbove: z.number().min(0).default(0),
  maxRadiusKm: z.number().min(0).default(10),
  active: z.boolean().default(true),
})

const updateRuleSchema = z.object({
  mode: z.enum(['fixed', 'per_km', 'per_route_min', 'zones_km', 'zones_min']).optional(),
  baseFee: z.number().min(0).optional(),
  perKmRate: z.number().min(0).optional(),
  perMinRate: z.number().min(0).optional(),
  freeAbove: z.number().min(0).optional(),
  maxRadiusKm: z.number().min(0).optional(),
  active: z.boolean().optional(),
})

const createZoneSchema = z.object({
  zoneType: z.enum(['km', 'min']).default('km'),
  minValue: z.number().min(0).default(0),
  maxValue: z.number().min(0),
  fee: z.number().min(0),
  label: z.string().max(255).optional(),
  active: z.boolean().default(true),
})

const updateZoneSchema = z.object({
  zoneType: z.enum(['km', 'min']).optional(),
  minValue: z.number().min(0).optional(),
  maxValue: z.number().min(0).optional(),
  fee: z.number().min(0).optional(),
  label: z.string().max(255).optional(),
  active: z.boolean().optional(),
})

export class DeliveryFeeController {
  listRules: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const rules = await db
      .select()
      .from(deliveryFeeRules)
      .where(
        and(
          eq(deliveryFeeRules.establishmentId, request.user.establishmentId),
          isNull(deliveryFeeRules.deletedAt)
        )
      )
      .orderBy(deliveryFeeRules.id)

    response.json(rules)
  }

  createRule: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const parsed = createRuleSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const [rule] = await db
      .insert(deliveryFeeRules)
      .values({
        ...parsed.data,
        establishmentId: request.user.establishmentId,
        baseFee: String(parsed.data.baseFee),
        perKmRate: String(parsed.data.perKmRate),
        perMinRate: String(parsed.data.perMinRate),
        freeAbove: String(parsed.data.freeAbove),
        maxRadiusKm: String(parsed.data.maxRadiusKm),
      })
      .returning()

    response.json(rule, 201)
  }

  updateRule: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = parseInt(request.params['id']!, 10)
    if (isNaN(id)) throw new ValidationError('ID inválido')

    const parsed = updateRuleSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const values: Record<string, unknown> = {}
    if (parsed.data.mode !== undefined) values.mode = parsed.data.mode
    if (parsed.data.baseFee !== undefined) values.baseFee = String(parsed.data.baseFee)
    if (parsed.data.perKmRate !== undefined) values.perKmRate = String(parsed.data.perKmRate)
    if (parsed.data.perMinRate !== undefined) values.perMinRate = String(parsed.data.perMinRate)
    if (parsed.data.freeAbove !== undefined) values.freeAbove = String(parsed.data.freeAbove)
    if (parsed.data.maxRadiusKm !== undefined) values.maxRadiusKm = String(parsed.data.maxRadiusKm)
    if (parsed.data.active !== undefined) values.active = parsed.data.active

    const [rule] = await db
      .update(deliveryFeeRules)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(deliveryFeeRules.id, id),
          eq(deliveryFeeRules.establishmentId, request.user.establishmentId),
          isNull(deliveryFeeRules.deletedAt)
        )
      )
      .returning()

    if (!rule) throw new NotFoundError('Regra de entrega')
    response.json(rule)
  }

  deleteRule: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = parseInt(request.params['id']!, 10)
    if (isNaN(id)) throw new ValidationError('ID inválido')

    const [rule] = await db
      .update(deliveryFeeRules)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(deliveryFeeRules.id, id),
          eq(deliveryFeeRules.establishmentId, request.user.establishmentId),
          isNull(deliveryFeeRules.deletedAt)
        )
      )
      .returning()

    if (!rule) throw new NotFoundError('Regra de entrega')
    response.json({ success: true })
  }

  listZones: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const ruleId = parseInt(request.params['ruleId']!, 10)
    if (isNaN(ruleId)) throw new ValidationError('ID da regra inválido')

    const zones = await db
      .select()
      .from(deliveryFeeZones)
      .where(
        and(
          eq(deliveryFeeZones.deliveryFeeRuleId, ruleId),
          eq(deliveryFeeZones.establishmentId, request.user.establishmentId),
          isNull(deliveryFeeZones.deletedAt)
        )
      )
      .orderBy(deliveryFeeZones.id)

    response.json(zones)
  }

  createZone: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const ruleId = parseInt(request.params['ruleId']!, 10)
    if (isNaN(ruleId)) throw new ValidationError('ID da regra inválido')

    const parsed = createZoneSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const [zone] = await db
      .insert(deliveryFeeZones)
      .values({
        deliveryFeeRuleId: ruleId,
        establishmentId: request.user.establishmentId,
        zoneType: parsed.data.zoneType,
        active: parsed.data.active,
        minValue: String(parsed.data.minValue),
        maxValue: String(parsed.data.maxValue),
        fee: String(parsed.data.fee),
        label: parsed.data.label ?? null,
      })
      .returning()

    response.json(zone, 201)
  }

  updateZone: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = parseInt(request.params['id']!, 10)
    if (isNaN(id)) throw new ValidationError('ID inválido')

    const parsed = updateZoneSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const values: Record<string, unknown> = {}
    if (parsed.data.zoneType !== undefined) values.zoneType = parsed.data.zoneType
    if (parsed.data.minValue !== undefined) values.minValue = String(parsed.data.minValue)
    if (parsed.data.maxValue !== undefined) values.maxValue = String(parsed.data.maxValue)
    if (parsed.data.fee !== undefined) values.fee = String(parsed.data.fee)
    if (parsed.data.label !== undefined) values.label = parsed.data.label || null
    if (parsed.data.active !== undefined) values.active = parsed.data.active

    const [zone] = await db
      .update(deliveryFeeZones)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(deliveryFeeZones.id, id),
          eq(deliveryFeeZones.establishmentId, request.user.establishmentId),
          isNull(deliveryFeeZones.deletedAt)
        )
      )
      .returning()

    if (!zone) throw new NotFoundError('Zona de entrega')
    response.json(zone)
  }

  deleteZone: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const id = parseInt(request.params['id']!, 10)
    if (isNaN(id)) throw new ValidationError('ID inválido')

    const [zone] = await db
      .update(deliveryFeeZones)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(deliveryFeeZones.id, id),
          eq(deliveryFeeZones.establishmentId, request.user.establishmentId),
          isNull(deliveryFeeZones.deletedAt)
        )
      )
      .returning()

    if (!zone) throw new NotFoundError('Zona de entrega')
    response.json({ success: true })
  }
}
