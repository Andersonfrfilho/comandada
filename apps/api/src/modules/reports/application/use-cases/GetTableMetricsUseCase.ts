import { eq, and, count, sum, avg, gte, isNotNull, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { toNumber } from '../../shared/numeric.util'

type Database = NodePgDatabase<typeof schema>

interface TableMetricsInput {
  establishmentId: string
  days: number
}

export interface TableBreakdown {
  tableId: string
  tableNumber: number
  comandaCount: number
  avgTimeMinutes: string
  totalRevenue: string
  avgSpendPerComanda: string
}

export interface TableMetrics {
  periodDays: number
  averageTimeAtTableMinutes: string
  averageSpendPerComanda: string
  averageSpendPerTable: string
  occupancyRatePercent: string
  operatingMinutesPerDay: number
  totalTables: number
  totalComandasClosed: number
  tables: TableBreakdown[]
}

export const OPERATING_HOURS_SETTING_KEY = 'operating_hours'

// Ocupação medida contra as 24h do dia é estruturalmente inútil: mesmo um
// salão lotado no horário de funcionamento não passa de ~5%. O denominador
// tem que ser o tempo em que o restaurante está aberto.
const DEFAULT_OPERATING_MINUTES_PER_DAY = 720

function readOperatingMinutes(value: unknown): number {
  if (typeof value !== 'object' || value === null) return DEFAULT_OPERATING_MINUTES_PER_DAY
  const minutes = (value as { dailyMinutes?: unknown }).dailyMinutes
  const parsed = typeof minutes === 'number' ? minutes : Number(minutes)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1440) {
    return DEFAULT_OPERATING_MINUTES_PER_DAY
  }
  return parsed
}

export class GetTableMetricsUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: TableMetricsInput): Promise<TableMetrics> {
    const { establishmentId, days } = input

    const from = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`

    const tablesList = await this.db
      .select({ id: schema.restaurantTables.id, number: schema.restaurantTables.number })
      .from(schema.restaurantTables)
      .where(eq(schema.restaurantTables.establishmentId, establishmentId))

    const totalTables = tablesList.length

    const closedComandas = await this.db
      .select({
        id: schema.comandas.id,
        tableId: schema.comandas.tableId,
        openedAt: schema.comandas.openedAt,
        closedAt: schema.comandas.closedAt,
        durationMinutes: sql<number>`
          EXTRACT(EPOCH FROM (${schema.comandas.closedAt} - ${schema.comandas.openedAt})) / 60
        `,
      })
      .from(schema.comandas)
      .where(and(
        eq(schema.comandas.establishmentId, establishmentId),
        gte(schema.comandas.openedAt, from),
        isNotNull(schema.comandas.closedAt),
      ))

    const totalComandasClosed = closedComandas.length

    const avgTimeMinutes = closedComandas.length > 0
      ? closedComandas.reduce((acc, c) => acc + toNumber(c.durationMinutes), 0) / closedComandas.length
      : 0

    const tableComandaSummary = new Map<string, {
      tableNumber: number
      comandaCount: number
      totalDurationMinutes: number
      revenue: number
    }>()

    for (const t of tablesList) {
      tableComandaSummary.set(t.id, {
        tableNumber: t.number,
        comandaCount: 0,
        totalDurationMinutes: 0,
        revenue: 0,
      })
    }

    for (const c of closedComandas) {
      if (!c.tableId) continue
      const entry = tableComandaSummary.get(c.tableId)
      if (entry) {
        entry.comandaCount++
        entry.totalDurationMinutes += toNumber(c.durationMinutes)
      }
    }

    // A receita precisa vir das mesmas comandas que entram na contagem, senão
    // numerador e denominador falam de populações diferentes: a mesa aparecia
    // com receita e "0 comandas fechadas" ao mesmo tempo, e o ticket médio da
    // casa dividia a receita do salão inteiro só pelas comandas fechadas.
    // Não existe vínculo pedido↔comanda no schema, então a atribuição é por
    // mesa dentro da janela de abertura e fechamento da comanda.
    const ordersRevenue = await this.db
      .select({
        tableId: schema.comandas.tableId,
        revenue: sum(schema.orders.totalAmount),
      })
      .from(schema.comandas)
      .innerJoin(schema.orders, and(
        eq(schema.orders.tableId, schema.comandas.tableId),
        eq(schema.orders.type, 'table'),
        gte(schema.orders.receivedAt, schema.comandas.openedAt),
        sql`${schema.orders.receivedAt} <= ${schema.comandas.closedAt}`,
        sql`${schema.orders.status} NOT IN ('cancelled')`,
      ))
      .where(and(
        eq(schema.comandas.establishmentId, establishmentId),
        gte(schema.comandas.openedAt, from),
        isNotNull(schema.comandas.closedAt),
      ))
      .groupBy(schema.comandas.tableId)

    for (const row of ordersRevenue) {
      if (!row.tableId) continue
      const entry = tableComandaSummary.get(row.tableId)
      if (entry) {
        entry.revenue = Number(row.revenue ?? 0)
      }
    }

    const tables: TableBreakdown[] = []
    for (const [tableId, summary] of tableComandaSummary) {
      tables.push({
        tableId,
        tableNumber: summary.tableNumber,
        comandaCount: summary.comandaCount,
        avgTimeMinutes:
          summary.comandaCount > 0
            ? (summary.totalDurationMinutes / summary.comandaCount).toFixed(1)
            : '0',
        totalRevenue: summary.revenue.toFixed(2),
        avgSpendPerComanda:
          summary.comandaCount > 0
            ? (summary.revenue / summary.comandaCount).toFixed(2)
            : '0',
      })
    }

    tables.sort((a, b) => a.tableNumber - b.tableNumber)

    const totalRevenue = tables.reduce((acc, t) => acc + Number(t.totalRevenue), 0)
    const avgSpendPerComanda = totalComandasClosed > 0
      ? totalRevenue / totalComandasClosed
      : 0

    const avgSpendPerTable = totalTables > 0
      ? totalRevenue / totalTables
      : 0

    const [operatingSetting] = await this.db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(and(
        eq(schema.settings.establishmentId, establishmentId),
        eq(schema.settings.key, OPERATING_HOURS_SETTING_KEY),
      ))
      .limit(1)

    const operatingMinutesPerDay = readOperatingMinutes(operatingSetting?.value)

    const totalOccupiedMinutes = closedComandas.reduce((acc, c) => acc + toNumber(c.durationMinutes), 0)
    const totalPeriodMinutes = totalTables * days * operatingMinutesPerDay
    const occupancyRate = totalPeriodMinutes > 0
      ? (totalOccupiedMinutes / totalPeriodMinutes) * 100
      : 0

    return {
      periodDays: days,
      averageTimeAtTableMinutes: avgTimeMinutes.toFixed(1),
      averageSpendPerComanda: avgSpendPerComanda.toFixed(2),
      averageSpendPerTable: avgSpendPerTable.toFixed(2),
      occupancyRatePercent: Math.min(occupancyRate, 100).toFixed(1),
      operatingMinutesPerDay,
      totalTables,
      totalComandasClosed,
      tables,
    }
  }
}
