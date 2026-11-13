import { eq, and, count, sum, gte, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { CacheProvider } from '@/shared/providers/CacheProvider'

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

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [ordersToday, pendingOrders, openRegister] = await Promise.all([
      this.db
        .select({ count: count(), totalAmount: sum(schema.orders.totalAmount) })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.establishmentId, establishmentId),
            gte(schema.orders.receivedAt, today)
          )
        ),
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
      revenuToday: ordersToday[0]?.totalAmount ?? '0.00',
      pendingOrders: pendingOrders[0]?.count ?? 0,
      cashRegisterOpen: !!openRegister,
      cashRegisterId: openRegister?.id ?? null,
    }

    await this.cache.set(cacheKey, JSON.stringify(metrics), CACHE_TTL_SECONDS)
    return metrics
  }
}
