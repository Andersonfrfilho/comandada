import { eq, and, count, sum, gte, lt, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { CacheProvider } from '@/shared/providers/CacheProvider'

type Database = NodePgDatabase<typeof schema>

interface MonthlyReportInput {
  establishmentId: string
  year: number
  month: number // 1-12
}

export interface DailyBreakdown {
  day: number
  orderCount: number
  revenue: string
}

export interface MonthlyReport {
  period: { year: number; month: number; label: string }
  summary: {
    totalRevenue: string
    completedOrders: number
    cancelledOrders: number
    avgTicket: string
    totalOrdersCreated: number
  }
  byChannel: Array<{ channel: string; count: number; revenue: string }>
  byType: Array<{ type: string; count: number; revenue: string }>
  byStatus: Array<{ status: string; count: number }>
  byPaymentMethod: Array<{ method: string; total: string }>
  topProducts: Array<{ productName: string; quantity: number; revenue: string }>
  dailyBreakdown: DailyBreakdown[]
}

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export class GetMonthlyReportUseCase {
  constructor(
    private readonly db: Database,
    private readonly cache: CacheProvider
  ) {}

  async execute(input: MonthlyReportInput): Promise<MonthlyReport> {
    const { establishmentId, year, month } = input

    const cacheKey = `report:monthly:${establishmentId}:${year}:${month}`
    const cached = await this.cache.get(cacheKey)
    if (cached) return JSON.parse(cached) as MonthlyReport

    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 1)

    const [
      statusBreakdown,
      channelBreakdown,
      typeBreakdown,
      topProducts,
      paymentMethods,
      dailyRows,
    ] = await Promise.all([
      // By status
      this.db
        .select({ status: schema.orders.status, count: count() })
        .from(schema.orders)
        .where(and(
          eq(schema.orders.establishmentId, establishmentId),
          gte(schema.orders.receivedAt, from),
          lt(schema.orders.receivedAt, to),
        ))
        .groupBy(schema.orders.status),

      // By channel (completed + non-cancelled for revenue)
      this.db
        .select({
          channel: schema.orders.channel,
          count: count(),
          revenue: sum(schema.orders.totalAmount),
        })
        .from(schema.orders)
        .where(and(
          eq(schema.orders.establishmentId, establishmentId),
          gte(schema.orders.receivedAt, from),
          lt(schema.orders.receivedAt, to),
          sql`${schema.orders.status} NOT IN ('cancelled')`,
        ))
        .groupBy(schema.orders.channel),

      // By type
      this.db
        .select({
          type: schema.orders.type,
          count: count(),
          revenue: sum(schema.orders.totalAmount),
        })
        .from(schema.orders)
        .where(and(
          eq(schema.orders.establishmentId, establishmentId),
          gte(schema.orders.receivedAt, from),
          lt(schema.orders.receivedAt, to),
          sql`${schema.orders.status} NOT IN ('cancelled')`,
        ))
        .groupBy(schema.orders.type),

      // Top 10 products (completed orders only)
      this.db
        .select({
          productName: schema.orderItems.productName,
          quantity: sql<number>`cast(sum(${schema.orderItems.quantity}) as integer)`,
          revenue: sum(schema.orderItems.totalPrice),
        })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
        .where(and(
          eq(schema.orders.establishmentId, establishmentId),
          gte(schema.orders.receivedAt, from),
          lt(schema.orders.receivedAt, to),
          eq(schema.orders.status, 'completed'),
        ))
        .groupBy(schema.orderItems.productName)
        .orderBy(sql`sum(${schema.orderItems.quantity}) DESC`)
        .limit(10),

      // Payment methods from cash movements
      this.db
        .select({
          method: schema.cashMovements.paymentMethod,
          total: sum(schema.cashMovements.amount),
        })
        .from(schema.cashMovements)
        .innerJoin(schema.cashRegisters, eq(schema.cashMovements.cashRegisterId, schema.cashRegisters.id))
        .where(and(
          eq(schema.cashRegisters.establishmentId, establishmentId),
          eq(schema.cashMovements.type, 'payment'),
          gte(schema.cashMovements.createdAt, from),
          lt(schema.cashMovements.createdAt, to),
        ))
        .groupBy(schema.cashMovements.paymentMethod),

      // Daily breakdown (completed orders)
      this.db
        .select({
          day: sql<number>`extract(day from ${schema.orders.receivedAt})::integer`,
          count: count(),
          revenue: sum(schema.orders.totalAmount),
        })
        .from(schema.orders)
        .where(and(
          eq(schema.orders.establishmentId, establishmentId),
          gte(schema.orders.receivedAt, from),
          lt(schema.orders.receivedAt, to),
          sql`${schema.orders.status} NOT IN ('cancelled')`,
        ))
        .groupBy(sql`extract(day from ${schema.orders.receivedAt})`)
        .orderBy(sql`extract(day from ${schema.orders.receivedAt})`),
    ])

    const completedRow = statusBreakdown.find((r) => r.status === 'completed')
    const cancelledRow = statusBreakdown.find((r) => r.status === 'cancelled')

    const totalRevenueNum = channelBreakdown.reduce((s, r) => s + Number(r.revenue ?? 0), 0)
    const completedOrders = completedRow?.count ?? 0
    const cancelledOrders = cancelledRow?.count ?? 0
    const totalCreated = statusBreakdown.reduce((s, r) => s + r.count, 0)
    const avgTicket = completedOrders > 0 ? totalRevenueNum / completedOrders : 0

    const report: MonthlyReport = {
      period: {
        year,
        month,
        label: `${MONTH_LABELS[month - 1] ?? ''} ${year}`,
      },
      summary: {
        totalRevenue: totalRevenueNum.toFixed(2),
        completedOrders,
        cancelledOrders,
        totalOrdersCreated: totalCreated,
        avgTicket: avgTicket.toFixed(2),
      },
      byStatus: statusBreakdown.map((r) => ({ status: r.status, count: r.count })),
      byChannel: channelBreakdown.map((r) => ({
        channel: r.channel,
        count: r.count,
        revenue: Number(r.revenue ?? 0).toFixed(2),
      })),
      byType: typeBreakdown.map((r) => ({
        type: r.type,
        count: r.count,
        revenue: Number(r.revenue ?? 0).toFixed(2),
      })),
      topProducts: topProducts.map((r) => ({
        productName: r.productName,
        quantity: r.quantity,
        revenue: Number(r.revenue ?? 0).toFixed(2),
      })),
      byPaymentMethod: paymentMethods
        .filter((r) => r.method !== null)
        .map((r) => ({
          method: r.method ?? 'unknown',
          total: Number(r.total ?? 0).toFixed(2),
        })),
      dailyBreakdown: dailyRows.map((r) => ({
        day: r.day,
        orderCount: r.count,
        revenue: Number(r.revenue ?? 0).toFixed(2),
      })),
    }

    // Cache for 5 min; no cache for current month (data still coming in)
    const now = new Date()
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month
    if (!isCurrentMonth) {
      await this.cache.set(cacheKey, JSON.stringify(report), 300)
    }

    return report
  }
}
