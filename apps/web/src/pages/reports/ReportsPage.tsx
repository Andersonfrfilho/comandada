import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { ORDER_CHANNEL_LABELS, ORDER_TYPE_LABELS, ORDER_STATUS_LABELS } from '@/constants/orderLabels'
import { Select } from '@/components/ui/Select'
import { AlertTriangle, Info } from 'lucide-react'
import { OrderIssuesSection } from './components/OrderIssuesSection'

interface DailyBreakdown {
  day: number
  orderCount: number
  revenue: string
}

interface MonthlyReport {
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

interface FunnelStage {
  stage: string
  averageMinutes: string
  orderCount: number
  label: string
}

interface FunnelTypeGroup {
  orderType: string
  label: string
  stages: FunnelStage[]
  bottleneck: string | null
}

interface FunnelAnalysis {
  periodDays: number
  overall: { slowestStage: string | null; slowestStageMins: string }
  byType: FunnelTypeGroup[]
}

interface TableBreakdown {
  tableId: string
  tableNumber: number
  comandaCount: number
  avgTimeMinutes: string
  totalRevenue: string
  avgSpendPerComanda: string
}

interface TableMetrics {
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

interface IngredientRankingItem {
  ingredientId: string
  ingredientName: string
  totalQuantityUsed: string
  movementCount: number
}

interface ProductProfitItem {
  productId: string
  productName: string
  price: string
  costPrice: string
  margin: string
  quantitySold: number
  totalRevenue: string
  totalProfit: string
}

interface IngredientsRanking {
  periodDays: number
  topIngredients: IngredientRankingItem[]
  topProfitableProducts: ProductProfitItem[]
  summary: {
    bestMargin: ProductProfitItem | null
    bestSeller: ProductProfitItem | null
    bestCombo: ProductProfitItem | null
  }
}

interface ProductProfitReport {
  periodDays: number
  bestMargin: ProductProfitEntry[]
  bestSellers: ProductProfitEntry[]
  bestCombo: ProductProfitEntry[]
}

interface ProductProfitEntry {
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

interface PreparationTimeComparison {
  productId: string
  productName: string
  cadastradoMinutes: number
  realAverageMinutes: string
  differenceMinutes: string
  differencePercent: string
  sampleSize: number
}

interface PreparationTimeReport {
  periodDays: number
  products: PreparationTimeComparison[]
  overallAccuracy: string
  totalProductsCompared: number
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  card_credit: 'Crédito',
  card_debit: 'Débito',
  cash: 'Dinheiro',
  voucher: 'Voucher',
}

const NO_DATA = '—'
const NO_COST_REGISTERED = 'sem custo'

function formatBRL(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Sem comanda fechada não existe média: exibir "R$ 0,00" faz a mesa parecer um
// caso de ticket zerado em vez de ausência de base de cálculo.
function formatPerComanda(value: string | number, comandaCount: number) {
  return comandaCount > 0 ? formatBRL(value) : NO_DATA
}

// Custo zerado significa ficha técnica não cadastrada, não margem de 100%.
function hasCost(costPrice: string | number) {
  return Number(costPrice) > 0
}

function getMiniBar(value: number, max: number) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return pct
}

export function ReportsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [funnelDays, setFunnelDays] = useState(30)
  const [tableDays, setTableDays] = useState(30)
  const [ingredientsDays, setIngredientsDays] = useState(30)
  const [prepTimeDays, setPrepTimeDays] = useState(30)

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['monthly-report', year, month],
    queryFn: () =>
      api.get<MonthlyReport>(
        `/reports/monthly?year=${year}&month=${month}`,
        accessToken ?? undefined
      ),
  })

  const { data: funnel, isLoading: funnelLoading } = useQuery({
    queryKey: ['funnel-analysis', funnelDays],
    queryFn: () =>
      api.get<FunnelAnalysis>(
        `/reports/funnel?days=${funnelDays}`,
        accessToken ?? undefined
      ),
  })

  const { data: tableMetrics, isLoading: tableLoading } = useQuery({
    queryKey: ['table-metrics', tableDays],
    queryFn: () =>
      api.get<TableMetrics>(
        `/reports/table-metrics?days=${tableDays}`,
        accessToken ?? undefined
      ),
  })

  const { data: ingredientsRanking, isLoading: ingredientsLoading } = useQuery({
    queryKey: ['ingredients-ranking', ingredientsDays],
    queryFn: () =>
      api.get<IngredientsRanking>(
        `/reports/ingredients-ranking?days=${ingredientsDays}`,
        accessToken ?? undefined
      ),
  })

  const { data: productProfit, isLoading: productProfitLoading } = useQuery({
    queryKey: ['product-profit', ingredientsDays],
    queryFn: () =>
      api.get<ProductProfitReport>(
        `/reports/product-profit?days=${ingredientsDays}`,
        accessToken ?? undefined
      ),
  })

  const { data: prepTimeReport, isLoading: prepTimeLoading } = useQuery({
    queryKey: ['prep-time-comparison', prepTimeDays],
    queryFn: () =>
      api.get<PreparationTimeReport>(
        `/reports/preparation-time-comparison?days=${prepTimeDays}`,
        accessToken ?? undefined
      ),
  })

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]

  const maxDailyRevenue = report
    ? Math.max(...report.dailyBreakdown.map((d) => Number(d.revenue)))
    : 0

  function handleExportCSV() {
    const from = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const to = new Date(year, month, 0).toISOString().split('T')[0]
    void api
      .get<{ csv: string; filename: string }>(
        `/reports/orders/export?from=${from}&to=${to}T23:59:59Z`,
        accessToken ?? undefined
      )
      .then(({ csv, filename }) => {
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename ?? 'orders.csv'
        a.click()
        URL.revokeObjectURL(url)
      })
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relatório mensal</h1>
          {report && (
            <p className="text-sm text-gray-500">{report.period.label}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-36">
            <Select
              value={String(month)}
              onChange={(value) => setMonth(parseInt(value, 10))}
              options={months.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </div>
          <div className="w-24">
            <Select
              value={String(year)}
              onChange={(value) => setYear(parseInt(value, 10))}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
            />
          </div>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors active:scale-95"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="text-gray-400 text-center py-16">Carregando relatório...</p>
      )}

      {isError && (
        <p className="text-red-500 text-center py-16">Erro ao carregar relatório.</p>
      )}

      {report && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Receita total</p>
              <p className="text-xl font-bold text-gray-900">{formatBRL(report.summary.totalRevenue)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Pedidos concluídos</p>
              <p className="text-xl font-bold text-gray-900">{report.summary.completedOrders}</p>
              <p className="text-xs text-gray-400">{report.summary.totalOrdersCreated} criados</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Ticket médio</p>
              <p className="text-xl font-bold text-gray-900">{formatBRL(report.summary.avgTicket)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Cancelados</p>
              <p className="text-xl font-bold text-red-600">{report.summary.cancelledOrders}</p>
              {report.summary.totalOrdersCreated > 0 && (
                <p className="text-xs text-gray-400">
                  {Math.round((report.summary.cancelledOrders / report.summary.totalOrdersCreated) * 100)}% do total
                </p>
              )}
            </div>
          </div>

          {/* Daily bar chart */}
          {report.dailyBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Receita por dia</h2>
              <div className="flex items-end gap-1 h-32">
                {report.dailyBreakdown.map((d) => {
                  const pct = getMiniBar(Number(d.revenue), maxDailyRevenue)
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div
                        className="w-full bg-brand-500 rounded-t-sm transition-all hover:bg-brand-600"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        Dia {d.day}: {formatBRL(d.revenue)} · {d.orderCount} pedidos
                      </div>
                      <span className="text-xs text-gray-400 leading-none">{d.day}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Three columns: channel / type / payment */}
          <div className="grid sm:grid-cols-3 gap-4">
            {/* By channel */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Por canal</h2>
              {report.byChannel.length === 0 ? (
                <p className="text-xs text-gray-400">Sem dados</p>
              ) : (
                <div className="space-y-2">
                  {report.byChannel.map((r) => (
                    <div key={r.channel} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{ORDER_CHANNEL_LABELS[r.channel] ?? r.channel}</span>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatBRL(r.revenue)}</p>
                        <p className="text-xs text-gray-400">{r.count} pedidos</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By type */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Por tipo</h2>
              {report.byType.length === 0 ? (
                <p className="text-xs text-gray-400">Sem dados</p>
              ) : (
                <div className="space-y-2">
                  {report.byType.map((r) => (
                    <div key={r.type} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                  {ORDER_TYPE_LABELS[r.type as keyof typeof ORDER_TYPE_LABELS] ?? r.type}
                </span>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatBRL(r.revenue)}</p>
                        <p className="text-xs text-gray-400">{r.count} pedidos</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By payment method */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Formas de pagamento</h2>
              {report.byPaymentMethod.length === 0 ? (
                <p className="text-xs text-gray-400">Sem dados do caixa</p>
              ) : (
                <div className="space-y-2">
                  {report.byPaymentMethod.map((r) => (
                    <div key={r.method} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{PAYMENT_LABELS[r.method] ?? r.method}</span>
                      <p className="font-semibold text-gray-900">{formatBRL(r.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top products */}
          {report.topProducts.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Top produtos vendidos</h2>
              <div className="space-y-2">
                {report.topProducts.map((prod, idx) => {
                  const maxQty = report.topProducts[0]?.quantity ?? 1
                  const pct = Math.round((prod.quantity / maxQty) * 100)
                  return (
                    <div key={prod.productName} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-5 text-right">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-medium text-gray-800 truncate pr-2">{prod.productName}</span>
                          <div className="text-right flex-shrink-0">
                            <span className="text-sm font-bold text-gray-900">{prod.quantity}×</span>
                            <span className="text-xs text-gray-400 ml-1">{formatBRL(prod.revenue)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Status breakdown */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Status dos pedidos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {report.byStatus.map((r) => (
                <div key={r.status} className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{r.count}</p>
                  <p className="text-xs text-gray-400">
                {ORDER_STATUS_LABELS[r.status as keyof typeof ORDER_STATUS_LABELS] ?? r.status}
              </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Funnel Analysis */}
      <div className="mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-gray-900">Análise de Funil</h2>
          <div className="flex items-center gap-2">
            <Select
              value={String(funnelDays)}
              onChange={(value) => setFunnelDays(parseInt(value, 10))}
              options={[
                { value: '7', label: '7 dias' },
                { value: '15', label: '15 dias' },
                { value: '30', label: '30 dias' },
                { value: '60', label: '60 dias' },
                { value: '90', label: '90 dias' },
              ]}
            />
          </div>
        </div>

        {funnelLoading && (
          <p className="text-gray-400 text-center py-8">Carregando funil...</p>
        )}

        {funnel && (
          <div className="space-y-4">
            {funnel.overall.slowestStage && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-xs text-red-500 mb-1">Gargalo identificado</p>
                <p className="text-sm font-semibold text-red-700">
                  {funnel.overall.slowestStage} ({funnel.overall.slowestStageMins} min em média)
                </p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {funnel.byType.map((group) => (
                <div key={group.orderType} className="bg-white rounded-2xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">{group.label}</h3>
                  <div className="space-y-2">
                    {group.stages.map((stage) => {
                      const isBottleneck = group.bottleneck === stage.label
                      return (
                        <div
                          key={stage.stage}
                          className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 ${
                            isBottleneck ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
                          }`}
                        >
                          <span className={`${isBottleneck ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                            {stage.label}
                          </span>
                          <span className={`font-bold ${isBottleneck ? 'text-red-700' : 'text-gray-900'}`}>
                            {stage.averageMinutes} min
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    {funnel.byType.find((g) => g.orderType === group.orderType)?.stages[0]?.orderCount ?? 0} pedidos
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <OrderIssuesSection />

      {/* Table Metrics */}
      <div className="mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-gray-900">Métricas de Mesa</h2>
          <div className="flex items-center gap-2">
            <Select
              value={String(tableDays)}
              onChange={(value) => setTableDays(parseInt(value, 10))}
              options={[
                { value: '7', label: '7 dias' },
                { value: '15', label: '15 dias' },
                { value: '30', label: '30 dias' },
                { value: '60', label: '60 dias' },
                { value: '90', label: '90 dias' },
              ]}
            />
          </div>
        </div>

        {tableLoading && (
          <p className="text-gray-400 text-center py-8">Carregando métricas...</p>
        )}

        {tableMetrics && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">Tempo médio na mesa</p>
                <p className="text-xl font-bold text-gray-900">{tableMetrics.averageTimeAtTableMinutes} min</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">Ticket médio por comanda</p>
                <p className="text-xl font-bold text-gray-900">{formatBRL(tableMetrics.averageSpendPerComanda)}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">Taxa de ocupação</p>
                <p className="text-xl font-bold text-gray-900">{tableMetrics.occupancyRatePercent}%</p>
                <p className="text-xs text-gray-400 mt-1">
                  sobre {Math.round(tableMetrics.operatingMinutesPerDay / 60)}h de salão por dia
                </p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">Comandas fechadas</p>
                <p className="text-xl font-bold text-gray-900">{tableMetrics.totalComandasClosed}</p>
                <p className="text-xs text-gray-400">{tableMetrics.totalTables} mesas</p>
              </div>
            </div>

            {/* Table breakdown */}
            {tableMetrics.tables.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Detalhamento por mesa</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 font-medium">Mesa</th>
                        <th className="pb-2 font-medium text-right">Comandas fechadas</th>
                        <th className="pb-2 font-medium text-right">Tempo médio</th>
                        <th className="pb-2 font-medium text-right">Receita total</th>
                        <th className="pb-2 font-medium text-right">Ticket/comanda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableMetrics.tables.map((t) => (
                        <tr key={t.tableId} className="border-b border-gray-50">
                          <td className="py-2 font-medium text-gray-800">Mesa {t.tableNumber}</td>
                          <td className="py-2 text-right text-gray-600">{t.comandaCount}</td>
                          <td className="py-2 text-right text-gray-600">
                            {t.comandaCount > 0 ? `${t.avgTimeMinutes} min` : NO_DATA}
                          </td>
                          <td className="py-2 text-right text-gray-900 font-medium">{formatBRL(t.totalRevenue)}</td>
                          <td className="py-2 text-right text-gray-600">
                            {formatPerComanda(t.avgSpendPerComanda, t.comandaCount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </div>
          )}
        </div>
      )}

      {/* Ingredients Ranking & Product Profit */}
      <div className="mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-gray-900">Ingredientes & Lucro</h2>
          <div className="flex items-center gap-2">
            <Select
              value={String(ingredientsDays)}
              onChange={(value) => setIngredientsDays(parseInt(value, 10))}
              options={[
                { value: '7', label: '7 dias' },
                { value: '15', label: '15 dias' },
                { value: '30', label: '30 dias' },
                { value: '60', label: '60 dias' },
                { value: '90', label: '90 dias' },
              ]}
            />
          </div>
        </div>

        {ingredientsLoading && (
          <p className="text-gray-400 text-center py-8">Carregando ranking de ingredientes...</p>
        )}

        {ingredientsRanking && (
          <div className="space-y-6">
            {ingredientsRanking.topProfitableProducts.some((prod) => !hasCost(prod.costPrice)) && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-xs text-amber-800">
                  Há pratos sem ficha técnica cadastrada. Sem o custo, o lucro exibido é igual à
                  receita e a margem aparece como 100% — cadastre a ficha técnica no catálogo para
                  que estes números façam sentido.
                </p>
              </div>
            )}
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {ingredientsRanking.summary.bestMargin && (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">Melhor Margem</p>
                  <p className="text-lg font-bold text-gray-900 truncate">
                    {ingredientsRanking.summary.bestMargin.productName}
                  </p>
                  <p
                    className={
                      hasCost(ingredientsRanking.summary.bestMargin.costPrice)
                        ? 'text-sm text-green-600'
                        : 'text-sm text-amber-600'
                    }
                  >
                    {hasCost(ingredientsRanking.summary.bestMargin.costPrice)
                      ? `${formatBRL(ingredientsRanking.summary.bestMargin.margin)} por unidade`
                      : NO_COST_REGISTERED}
                  </p>
                </div>
              )}
              {ingredientsRanking.summary.bestSeller && (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">Mais Vendido</p>
                  <p className="text-lg font-bold text-gray-900 truncate">
                    {ingredientsRanking.summary.bestSeller.productName}
                  </p>
                  <p className="text-sm text-gray-600">
                    {ingredientsRanking.summary.bestSeller.quantitySold} unidades
                  </p>
                </div>
              )}
              {ingredientsRanking.summary.bestCombo && (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">Melhor Combo</p>
                  <p className="text-lg font-bold text-gray-900 truncate">
                    {ingredientsRanking.summary.bestCombo.productName}
                  </p>
                  <p
                    className={
                      hasCost(ingredientsRanking.summary.bestCombo.costPrice)
                        ? 'text-sm text-green-600'
                        : 'text-sm text-amber-600'
                    }
                  >
                    {hasCost(ingredientsRanking.summary.bestCombo.costPrice)
                      ? `${formatBRL(ingredientsRanking.summary.bestCombo.totalProfit)} lucro`
                      : NO_COST_REGISTERED}
                  </p>
                </div>
              )}
            </div>

            {/* Top Ingredients */}
            {ingredientsRanking.topIngredients.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Ingredientes mais utilizados</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 font-medium">#</th>
                        <th className="pb-2 font-medium">Ingrediente</th>
                        <th className="pb-2 font-medium text-right">Qtd consumida</th>
                        <th className="pb-2 font-medium text-right">Movimentações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredientsRanking.topIngredients.map((item, idx) => (
                        <tr key={item.ingredientId} className="border-b border-gray-50">
                          <td className="py-2 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="py-2 font-medium text-gray-800">{item.ingredientName}</td>
                          <td className="py-2 text-right text-gray-900 font-medium">{item.totalQuantityUsed}</td>
                          <td className="py-2 text-right text-gray-600">{item.movementCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top Profitable Products */}
            {ingredientsRanking.topProfitableProducts.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Pratos mais lucrativos</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 font-medium">#</th>
                        <th className="pb-2 font-medium">Prato</th>
                        <th className="pb-2 font-medium text-right">Preço</th>
                        <th className="pb-2 font-medium text-right">Custo</th>
                        <th className="pb-2 font-medium text-right">Margem</th>
                        <th className="pb-2 font-medium text-right">Vendidos</th>
                        <th className="pb-2 font-medium text-right">Lucro total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredientsRanking.topProfitableProducts.map((prod, idx) => (
                        <tr key={prod.productId} className="border-b border-gray-50">
                          <td className="py-2 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="py-2 font-medium text-gray-800 truncate max-w-[150px]">{prod.productName}</td>
                          <td className="py-2 text-right text-gray-600">{formatBRL(prod.price)}</td>
                          <td className="py-2 text-right text-gray-600">
                            {hasCost(prod.costPrice) ? formatBRL(prod.costPrice) : (
                              <span className="text-amber-600">{NO_COST_REGISTERED}</span>
                            )}
                          </td>
                          <td className="py-2 text-right text-green-600 font-medium">
                            {hasCost(prod.costPrice) ? formatBRL(prod.margin) : NO_DATA}
                          </td>
                          <td className="py-2 text-right text-gray-900">{prod.quantitySold}</td>
                          <td className="py-2 text-right text-green-700 font-semibold">
                            {hasCost(prod.costPrice) ? formatBRL(prod.totalProfit) : NO_DATA}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {productProfitLoading && (
          <p className="text-gray-400 text-center py-8 mt-4">Carregando análise de lucro...</p>
        )}

        {productProfit && (
          <div className="space-y-4 mt-4">
            {productProfit.bestCombo.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Melhor Combo (Margem x Volume)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 font-medium">Prato</th>
                        <th className="pb-2 font-medium text-right">Margem %</th>
                        <th className="pb-2 font-medium text-right">Vendidos</th>
                        <th className="pb-2 font-medium text-right">Lucro total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productProfit.bestCombo.map((prod) => (
                        <tr key={prod.productId} className="border-b border-gray-50">
                          <td className="py-2 font-medium text-gray-800 truncate max-w-[200px]">{prod.productName}</td>
                          <td className="py-2 text-right text-green-600">
                            {hasCost(prod.costPrice) ? `${prod.marginPercent}%` : (
                              <span className="text-amber-600">{NO_COST_REGISTERED}</span>
                            )}
                          </td>
                          <td className="py-2 text-right text-gray-900">{prod.quantitySold}</td>
                          <td className="py-2 text-right text-green-700 font-semibold">
                            {hasCost(prod.costPrice) ? formatBRL(prod.totalProfit) : NO_DATA}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preparation Time Comparison */}
      <div className="mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-gray-900">Tempo de Preparo</h2>
          <div className="flex items-center gap-2">
            <Select
              value={String(prepTimeDays)}
              onChange={(value) => setPrepTimeDays(parseInt(value, 10))}
              options={[
                { value: '7', label: '7 dias' },
                { value: '15', label: '15 dias' },
                { value: '30', label: '30 dias' },
                { value: '60', label: '60 dias' },
                { value: '90', label: '90 dias' },
              ]}
            />
          </div>
        </div>

        {prepTimeLoading && (
          <p className="text-gray-400 text-center py-8">Carregando comparativo de tempo...</p>
        )}

        {prepTimeReport && (
          <div className="space-y-6">
            {/* Accuracy card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm inline-block min-w-[180px]">
              <p className="text-xs text-gray-400 mb-1">Acurácia média</p>
              <p className={`text-xl font-bold ${Number(prepTimeReport.overallAccuracy) >= 80 ? 'text-green-600' : Number(prepTimeReport.overallAccuracy) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {prepTimeReport.overallAccuracy}%
              </p>
              <p className="text-xs text-gray-400">{prepTimeReport.totalProductsCompared} produtos comparados</p>
            </div>

            {prepTimeReport.products.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-xs text-blue-800">
                  O tempo real é medido por item, do início do preparo até a cozinha marcar o
                  item como pronto. Itens liberados só quando o pedido inteiro sai carregam o
                  tempo do prato mais demorado — marcar item a item na cozinha é o que deixa a
                  comparação fiel.
                </p>
              </div>
            )}

            {prepTimeReport.products.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">
                  Tempo Cadastrado vs Real (in_production → ready)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 font-medium">Produto</th>
                        <th className="pb-2 font-medium text-right">Tempo cadastrado</th>
                        <th className="pb-2 font-medium text-right">Tempo real médio</th>
                        <th className="pb-2 font-medium text-right">Diferença</th>
                        <th className="pb-2 font-medium text-right">Amostras</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prepTimeReport.products.map((prod) => {
                        const isWorse = Number(prod.differenceMinutes) > 0
                        return (
                          <tr
                            key={prod.productId}
                            className={`border-b border-gray-50 ${isWorse ? 'bg-red-50' : ''}`}
                          >
                            <td className={`py-2 font-medium ${isWorse ? 'text-red-800' : 'text-gray-800'}`}>
                              {prod.productName}
                            </td>
                            <td className="py-2 text-right text-gray-600">{prod.cadastradoMinutes} min</td>
                            <td className="py-2 text-right text-gray-900 font-medium">{prod.realAverageMinutes} min</td>
                            <td className={`py-2 text-right font-medium ${isWorse ? 'text-red-600' : 'text-green-600'}`}>
                              {isWorse ? '+' : ''}{prod.differenceMinutes} min ({isWorse ? '+' : ''}{prod.differencePercent}%)
                            </td>
                            <td className="py-2 text-right text-gray-500">{prod.sampleSize}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {prepTimeReport.products.length === 0 && (
              <p className="text-gray-400 text-center py-8">Sem dados suficientes para comparar.</p>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  )
}
