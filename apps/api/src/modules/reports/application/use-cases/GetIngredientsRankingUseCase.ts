import { eq, and, count, sum, gte, sql, desc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

// Baixa de estoque por pedido, gravada pelo `DeductStockForOrderUseCase`. O
// ranking media `consumption`, que nenhum ponto do sistema escreve — a lista
// vinha sempre vazia, e a tela dizia "sem consumo" com o estoque baixando.
const CONSUMPTION_MOVEMENT_TYPE = 'out'

interface IngredientsRankingInput {
  establishmentId: string
  days: number
}

export interface IngredientRankingItem {
  ingredientId: string
  ingredientName: string
  totalQuantityUsed: string
  movementCount: number
}

export interface ProductProfitItem {
  productId: string
  productName: string
  price: string
  costPrice: string
  margin: string
  quantitySold: number
  totalRevenue: string
  totalProfit: string
}

export interface ProfitSummary {
  bestMargin: ProductProfitItem | null
  bestSeller: ProductProfitItem | null
  bestCombo: ProductProfitItem | null
}

export interface IngredientsRanking {
  periodDays: number
  topIngredients: IngredientRankingItem[]
  topProfitableProducts: ProductProfitItem[]
  summary: ProfitSummary
}

export class GetIngredientsRankingUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: IngredientsRankingInput): Promise<IngredientsRanking> {
    const { establishmentId, days } = input

    const from = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`

    const topIngredients = await this.db
      .select({
        ingredientId: schema.stockMovements.ingredientId,
        ingredientName: schema.ingredients.name,
        totalQuantityUsed: sql<string>`ROUND(SUM(ABS(${schema.stockMovements.quantity})::numeric), 2)`,
        movementCount: count(),
      })
      .from(schema.stockMovements)
      .innerJoin(schema.ingredients, eq(schema.stockMovements.ingredientId, schema.ingredients.id))
      .where(and(
        eq(schema.stockMovements.establishmentId, establishmentId),
        eq(schema.stockMovements.movementType, CONSUMPTION_MOVEMENT_TYPE),
        gte(schema.stockMovements.createdAt, from),
      ))
      .groupBy(schema.stockMovements.ingredientId, schema.ingredients.name)
      .orderBy(desc(sql`SUM(ABS(${schema.stockMovements.quantity}))`))
      .limit(10)

    const productProfitData = await this.db
      .select({
        productId: schema.orderItems.productId,
        productName: schema.orderItems.productName,
        price: schema.products.price,
        costPrice: sql<string>`COALESCE(${schema.products.costPrice}, '0')`,
        quantitySold: sql<number>`CAST(SUM(${schema.orderItems.quantity}) AS INTEGER)`,
        totalRevenue: sum(schema.orderItems.totalPrice),
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

    const productProfitRanking = productProfitData
      .filter((p) => Number(p.price ?? 0) > 0)
      .map((p) => {
        const priceNum = Number(p.price)
        const costNum = Number(p.costPrice)
        const margin = priceNum - costNum
        const totalRevenue = Number(p.totalRevenue ?? 0)
        const totalProfit = margin * p.quantitySold

        return {
          productId: p.productId ?? '',
          productName: p.productName,
          price: priceNum.toFixed(2),
          costPrice: costNum.toFixed(2),
          margin: margin.toFixed(2),
          quantitySold: p.quantitySold,
          totalRevenue: totalRevenue.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
        }
      })
      .sort((a, b) => Number(b.totalProfit) - Number(a.totalProfit))

    const top10ByProfit = productProfitRanking.slice(0, 10)

    let bestMargin: ProductProfitItem | null = null
    let bestSeller: ProductProfitItem | null = null
    let bestCombo: ProductProfitItem | null = null

    if (productProfitRanking.length > 0) {
      const byMargin = [...productProfitRanking].sort(
        (a, b) => Number(b.margin) - Number(a.margin)
      )
      bestMargin = byMargin[0] ?? null

      const byVolume = [...productProfitRanking].sort(
        (a, b) => b.quantitySold - a.quantitySold
      )
      bestSeller = byVolume[0] ?? null

      const byCombo = [...productProfitRanking].sort(
        (a, b) => (Number(b.margin) * b.quantitySold) - (Number(a.margin) * a.quantitySold)
      )
      bestCombo = byCombo[0] ?? null
    }

    return {
      periodDays: days,
      topIngredients: topIngredients.map((row) => ({
        ingredientId: row.ingredientId,
        ingredientName: row.ingredientName,
        totalQuantityUsed: row.totalQuantityUsed,
        movementCount: row.movementCount,
      })),
      topProfitableProducts: top10ByProfit,
      summary: { bestMargin, bestSeller, bestCombo },
    }
  }
}
