import { eq, and, count, sum, gte, sql, desc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

interface ProductProfitInput {
  establishmentId: string
  days: number
}

export interface ProductProfitEntry {
  productId: string
  productName: string
  price: string
  costPrice: string
  marginPerUnit: string
  marginPercent: string
  quantitySold: number
  totalRevenue: string
  totalProfit: string
  ordersCount: number
}

export interface ProductProfitReport {
  periodDays: number
  bestMargin: ProductProfitEntry[]
  bestSellers: ProductProfitEntry[]
  bestCombo: ProductProfitEntry[]
}

export class GetProductProfitUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: ProductProfitInput): Promise<ProductProfitReport> {
    const { establishmentId, days } = input

    const from = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`

    const rows = await this.db
      .select({
        productId: schema.orderItems.productId,
        productName: schema.orderItems.productName,
        price: schema.products.price,
        costPrice: sql<string>`COALESCE(${schema.products.costPrice}, '0')`,
        quantitySold: sql<number>`CAST(SUM(${schema.orderItems.quantity}) AS INTEGER)`,
        totalRevenue: sum(schema.orderItems.totalPrice),
        ordersCount: count(sql`DISTINCT ${schema.orders.id}`),
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .leftJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
      .where(and(
        eq(schema.orders.establishmentId, establishmentId),
        gte(schema.orders.receivedAt, from),
        eq(schema.orders.status, 'completed'),
      ))
      .groupBy(
        schema.orderItems.productId,
        schema.orderItems.productName,
        schema.products.price,
        schema.products.costPrice,
      )

    const entries: ProductProfitEntry[] = rows
      .filter((r) => Number(r.price ?? 0) > 0)
      .map((r) => {
        const priceNum = Number(r.price)
        const costNum = Number(r.costPrice)
        const marginPerUnit = priceNum - costNum
        const marginPercent = priceNum > 0
          ? ((marginPerUnit / priceNum) * 100)
          : 0
        const totalRevenue = Number(r.totalRevenue ?? 0)
        const totalProfit = marginPerUnit * r.quantitySold

        return {
          productId: r.productId ?? '',
          productName: r.productName,
          price: priceNum.toFixed(2),
          costPrice: costNum.toFixed(2),
          marginPerUnit: marginPerUnit.toFixed(2),
          marginPercent: marginPercent.toFixed(1),
          quantitySold: r.quantitySold,
          totalRevenue: totalRevenue.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          ordersCount: r.ordersCount,
        }
      })

    const bestMargin = [...entries]
      .sort((a, b) => Number(b.marginPerUnit) - Number(a.marginPerUnit))
      .slice(0, 5)

    const bestSellers = [...entries]
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5)

    const bestCombo = [...entries]
      .sort((a, b) => Number(b.totalProfit) - Number(a.totalProfit))
      .slice(0, 5)

    return {
      periodDays: days,
      bestMargin,
      bestSellers,
      bestCombo,
    }
  }
}
