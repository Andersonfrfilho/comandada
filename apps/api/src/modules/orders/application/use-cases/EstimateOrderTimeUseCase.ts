import { and, count, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import * as schema from '@/infra/database/schema'
import type { OrderType } from '@/shared/types'
import {
  ORDER_ACTIVE_KITCHEN_STATUSES,
  ORDER_ESTIMATE_DEFAULTS,
  ORDER_ESTIMATE_HISTORY,
  ORDER_ESTIMATE_SETTING_KEYS,
} from '../../shared/orders.constant'

type Database = NodePgDatabase<typeof schema>

export interface EstimateOrderTimeParams {
  readonly establishmentId: string
  readonly type: OrderType
  readonly productIds: readonly string[]
  readonly scheduledFor?: Date | undefined
  readonly now: Date
}

export interface EstimateOrderTimeResult {
  readonly estimatedAt: Date
  readonly minutes: number
}

export interface EstimateMinutesInput {
  readonly preparationMinutes: number
  readonly ordersAhead: number
  readonly deliveryMinutes: number
  readonly isDelivery: boolean
}

export function estimateMinutes(input: EstimateMinutesInput): number {
  const queue = Math.min(
    input.ordersAhead * ORDER_ESTIMATE_DEFAULTS.queueMinutesPerOrder,
    ORDER_ESTIMATE_DEFAULTS.maxQueueMinutes
  )
  return input.preparationMinutes + queue + (input.isDelivery ? input.deliveryMinutes : 0)
}

export interface ProductPreparationSample {
  /** Tempo cadastrado no produto. */
  readonly registeredMinutes: number | null
  /** Média real medida na cozinha (pronto − início do preparo) e quantas medições ela tem. */
  readonly realAverageMinutes: number | null
  readonly samples: number
}

/**
 * Preparo do pedido = o item mais demorado. Para cada item vale a média real quando há medições
 * suficientes, senão o tempo cadastrado. Sem nenhum dos dois, `undefined` (fica o valor padrão).
 */
export function pickPreparationMinutes(products: readonly ProductPreparationSample[]): number | undefined {
  const minutes = products.flatMap((product) => {
    if (product.realAverageMinutes !== null && product.samples >= ORDER_ESTIMATE_HISTORY.minSamples) {
      return [Math.max(1, Math.round(product.realAverageMinutes))]
    }
    return product.registeredMinutes ? [product.registeredMinutes] : []
  })
  return minutes.length > 0 ? Math.max(...minutes) : undefined
}

/** Tempo de rua médio, só com amostras suficientes. */
export function pickDeliveryMinutes(average: number | null, samples: number): number | undefined {
  if (average === null || samples < ORDER_ESTIMATE_HISTORY.minSamples) return undefined
  return Math.max(1, Math.round(average))
}

export class EstimateOrderTimeUseCase {
  constructor(private readonly db: Database) {}

  async execute(params: EstimateOrderTimeParams): Promise<EstimateOrderTimeResult> {
    if (params.scheduledFor) {
      return { estimatedAt: params.scheduledFor, minutes: Math.round((params.scheduledFor.getTime() - params.now.getTime()) / 60_000) }
    }
    const since = new Date(params.now.getTime() - ORDER_ESTIMATE_HISTORY.days * 24 * 60 * 60_000)
    const isDelivery = params.type === 'delivery'
    const [settings, preparationMinutes, ordersAhead, deliveryMinutes] = await Promise.all([
      this.loadSettings(params.establishmentId),
      this.longestPreparation(params.establishmentId, params.productIds, since),
      this.countOrdersAhead(params),
      isDelivery ? this.averageDeliveryMinutes(params.establishmentId, since) : Promise.resolve(undefined),
    ])
    const minutes = estimateMinutes({
      preparationMinutes: preparationMinutes ?? settings.preparationMinutes,
      ordersAhead,
      deliveryMinutes: deliveryMinutes ?? settings.deliveryMinutes,
      isDelivery: params.type === 'delivery',
    })
    return { estimatedAt: new Date(params.now.getTime() + minutes * 60_000), minutes }
  }

  private async loadSettings(establishmentId: string) {
    const rows = await this.db.query.settings.findMany({
      where: and(
        eq(schema.settings.establishmentId, establishmentId),
        inArray(schema.settings.key, Object.values(ORDER_ESTIMATE_SETTING_KEYS))
      ),
    })
    const numberOf = (key: string, fallback: number): number => {
      const value = Number(rows.find((row) => row.key === key)?.value)
      return Number.isFinite(value) && value > 0 ? value : fallback
    }
    return {
      preparationMinutes: numberOf(ORDER_ESTIMATE_SETTING_KEYS.preparationMinutes, ORDER_ESTIMATE_DEFAULTS.preparationMinutes),
      deliveryMinutes: numberOf(ORDER_ESTIMATE_SETTING_KEYS.deliveryMinutes, ORDER_ESTIMATE_DEFAULTS.deliveryMinutes),
    }
  }

  private async longestPreparation(
    establishmentId: string,
    productIds: readonly string[],
    since: Date
  ): Promise<number | undefined> {
    if (productIds.length === 0) return undefined
    const ids = [...new Set(productIds)]
    const [products, realTimes] = await Promise.all([
      this.db.query.products.findMany({
        where: inArray(schema.products.id, ids),
        columns: { id: true, preparationTimeMinutes: true },
      }),
      this.db
        .select({
          productId: schema.orderItems.productId,
          averageMinutes: sql<string | null>`AVG(EXTRACT(EPOCH FROM (${schema.orderItems.readyAt} - ${schema.orderItems.productionStartedAt})) / 60)`,
          samples: count(),
        })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .where(
          and(
            eq(schema.orders.establishmentId, establishmentId),
            inArray(schema.orderItems.productId, ids),
            isNotNull(schema.orderItems.productionStartedAt),
            isNotNull(schema.orderItems.readyAt),
            gte(schema.orderItems.readyAt, since)
          )
        )
        .groupBy(schema.orderItems.productId),
    ])
    return pickPreparationMinutes(
      products.map((product) => {
        const real = realTimes.find((row) => row.productId === product.id)
        return {
          registeredMinutes: product.preparationTimeMinutes,
          realAverageMinutes: real?.averageMinutes != null ? Number(real.averageMinutes) : null,
          samples: real?.samples ?? 0,
        }
      })
    )
  }

  private async averageDeliveryMinutes(establishmentId: string, since: Date): Promise<number | undefined> {
    const [row] = await this.db
      .select({
        averageMinutes: sql<string | null>`AVG(EXTRACT(EPOCH FROM (${schema.orders.completedAt} - ${schema.orders.dispatchedAt})) / 60)`,
        samples: count(),
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.establishmentId, establishmentId),
          eq(schema.orders.type, 'delivery'),
          isNotNull(schema.orders.dispatchedAt),
          isNotNull(schema.orders.completedAt),
          gte(schema.orders.completedAt, since)
        )
      )
    return pickDeliveryMinutes(row?.averageMinutes != null ? Number(row.averageMinutes) : null, row?.samples ?? 0)
  }

  // Encomendas de mais tarde não disputam a cozinha agora.
  private async countOrdersAhead(params: EstimateOrderTimeParams): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.establishmentId, params.establishmentId),
          inArray(schema.orders.status, [...ORDER_ACTIVE_KITCHEN_STATUSES]),
          or(isNull(schema.orders.scheduledFor), lte(schema.orders.scheduledFor, params.now))
        )
      )
    // The order being estimated is already saved and counted; it is not ahead of itself.
    return Math.max((row?.total ?? 1) - 1, 0)
  }
}
