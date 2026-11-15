import { eq, and, count, gte, lt, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import { localDayRange, orderRevenueAmount, revenueOrdersWhere } from '@/modules/reports/shared/revenue'

type Database = NodePgDatabase<typeof schema>

const CACHE_TTL_SECONDS = 30

export class GetDashboardMetricsUseCase {
  constructor(
    private readonly db: Database,
    private readonly cache: CacheProvider
  ) {}

  async execute(establishmentId: string) {
    const cacheKey = `dashboard:metrics:${establishmentId}`
    const cached = await this.cache.get(cacheKey)
    if (cached) return JSON.parse(cached)

    // "Hoje" é o dia do restaurante, não o do servidor.
    const today = localDayRange(new Date())

    const [ordersToday, revenueToday, pendingOrders, openRegister] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.establishmentId, establishmentId),
            gte(schema.orders.receivedAt, today.from),
            lt(schema.orders.receivedAt, today.to)
          )
        ),
      this.db
        .select({ total: sql<string>`coalesce(sum(${orderRevenueAmount}), 0)` })
        .from(schema.orders)
        .where(revenueOrdersWhere(establishmentId, today)),
      this.db
        .select({ count: count() })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.establishmentId, establishmentId),
            sql`${schema.orders.status} NOT IN ('completed', 'cancelled')`
          )
        ),
      this.db.query.cashRegisters.findFirst({
        where: and(
          eq(schema.cashRegisters.establishmentId, establishmentId),
          eq(schema.cashRegisters.status, 'open')
        ),
      }),
    ])

    const metrics = {
      ordersToday: ordersToday[0]?.count ?? 0,
      revenuToday: Number(revenueToday[0]?.total ?? 0).toFixed(2),
      pendingOrders: pendingOrders[0]?.count ?? 0,
      cashRegisterOpen: !!openRegister,
      cashRegisterId: openRegister?.id ?? null,
    }

    await this.cache.set(cacheKey, JSON.stringify(metrics), CACHE_TTL_SECONDS)
    return metrics
  }
}
