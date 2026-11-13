import { and, count, countDistinct, desc, eq, gte, isNotNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { ORDER_ISSUE_RECENT_LIMIT, ORDER_ISSUE_STATUS } from '../../shared/issues.constant'

type Database = NodePgDatabase<typeof schema>

export interface OrderIssueReportInput {
  readonly establishmentId: string
  readonly days: number
  readonly now?: Date | undefined
}

export interface OrderIssueReport {
  readonly periodDays: number
  readonly totalOrders: number
  readonly ordersWithIssue: number
  /** Pedidos com problema ÷ pedidos do período, em %, com uma casa. */
  readonly issueRatePercent: string
  readonly totalIssues: number
  readonly openIssues: number
  readonly byCategory: ReadonlyArray<{ category: string; count: number }>
  readonly recent: ReadonlyArray<{
    id: string
    createdAt: Date
    category: string
    description: string | null
    status: string
    orderId: string | null
    orderCode: string | null
    customerName: string | null
  }>
}

export function issueRatePercent(ordersWithIssue: number, totalOrders: number): string {
  if (totalOrders === 0) return '0.0'
  return ((ordersWithIssue / totalOrders) * 100).toFixed(1)
}

export class GetOrderIssueReportUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: OrderIssueReportInput): Promise<OrderIssueReport> {
    const now = input.now ?? new Date()
    const since = new Date(now.getTime() - input.days * 24 * 60 * 60_000)
    const issueInPeriod = and(
      eq(schema.orderIssues.establishmentId, input.establishmentId),
      gte(schema.orderIssues.createdAt, since)
    )

    const [ordersRow, issuesRow, ordersWithIssueRow, openRow, byCategory, recent] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(schema.orders)
        .where(and(eq(schema.orders.establishmentId, input.establishmentId), gte(schema.orders.createdAt, since))),
      this.db.select({ total: count() }).from(schema.orderIssues).where(issueInPeriod),
      this.db
        .select({ total: countDistinct(schema.orderIssues.orderId) })
        .from(schema.orderIssues)
        .where(and(issueInPeriod, isNotNull(schema.orderIssues.orderId))),
      this.db
        .select({ total: count() })
        .from(schema.orderIssues)
        .where(and(issueInPeriod, eq(schema.orderIssues.status, ORDER_ISSUE_STATUS.open))),
      this.db
        .select({ category: schema.orderIssues.category, count: count() })
        .from(schema.orderIssues)
        .where(issueInPeriod)
        .groupBy(schema.orderIssues.category)
        .orderBy(desc(count())),
      this.db
        .select({
          id: schema.orderIssues.id,
          createdAt: schema.orderIssues.createdAt,
          category: schema.orderIssues.category,
          description: schema.orderIssues.description,
          status: schema.orderIssues.status,
          orderId: schema.orderIssues.orderId,
          orderCode: schema.orders.code,
          customerName: schema.customers.name,
        })
        .from(schema.orderIssues)
        .leftJoin(schema.orders, eq(schema.orders.id, schema.orderIssues.orderId))
        .leftJoin(schema.customers, eq(schema.customers.id, schema.orderIssues.customerId))
        .where(issueInPeriod)
        .orderBy(desc(schema.orderIssues.createdAt))
        .limit(ORDER_ISSUE_RECENT_LIMIT),
    ])

    const totalOrders = ordersRow[0]?.total ?? 0
    const ordersWithIssue = ordersWithIssueRow[0]?.total ?? 0
    return {
      periodDays: input.days,
      totalOrders,
      ordersWithIssue,
      issueRatePercent: issueRatePercent(ordersWithIssue, totalOrders),
      totalIssues: issuesRow[0]?.total ?? 0,
      openIssues: openRow[0]?.total ?? 0,
      byCategory,
      recent,
    }
  }
}
