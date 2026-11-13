import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Select } from '@/components/ui/Select'

interface OrderIssueReport {
  periodDays: number
  totalOrders: number
  ordersWithIssue: number
  issueRatePercent: string
  totalIssues: number
  openIssues: number
  byCategory: Array<{ category: string; count: number }>
  recent: Array<{
    id: string
    createdAt: string
    category: string
    description: string | null
    status: string
    orderId: string | null
    orderCode: string | null
    customerName: string | null
  }>
}

// Mesmos ids do bot (src/shared/constants/IssueConstants.ts) e da API (modules/issues).
const ISSUE_CATEGORY_LABELS: Record<string, string> = {
  atraso: 'Pedido atrasado',
  item_faltando: 'Faltou item',
  item_errado: 'Item errado',
  qualidade: 'Qualidade da comida',
  entrega: 'Problema na entrega',
  cobranca: 'Pagamento ou troco',
  outro: 'Outro',
}

const PERIOD_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '15', label: '15 dias' },
  { value: '30', label: '30 dias' },
  { value: '60', label: '60 dias' },
  { value: '90', label: '90 dias' },
]

export function OrderIssuesSection() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [days, setDays] = useState(30)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const { data: report, isLoading } = useQuery({
    queryKey: ['order-issues', days],
    queryFn: () => api.get<OrderIssueReport>(`/reports/order-issues?days=${days}`, accessToken ?? undefined),
  })

  async function resolve(issueId: string) {
    setResolvingId(issueId)
    try {
      await api.patch(`/order-issues/${issueId}/resolve`, {}, accessToken ?? undefined)
      await queryClient.invalidateQueries({ queryKey: ['order-issues'] })
    } finally {
      setResolvingId(null)
    }
  }

  const maxCount = Math.max(1, ...(report?.byCategory ?? []).map((row) => row.count))

  return (
    <div className="mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900">Problemas relatados</h2>
        <Select value={String(days)} onChange={(value) => setDays(parseInt(value, 10))} options={PERIOD_OPTIONS} />
      </div>

      {isLoading && <p className="text-gray-400 text-center py-8">Carregando problemas...</p>}

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Pedidos com problema</p>
              <p className="text-2xl font-bold text-gray-900">{report.issueRatePercent}%</p>
              <p className="text-xs text-gray-400 mt-1">
                {report.ordersWithIssue} de {report.totalOrders} pedidos
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Relatos no período</p>
              <p className="text-2xl font-bold text-gray-900">{report.totalIssues}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Em aberto</p>
              <p className={`text-2xl font-bold ${report.openIssues > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {report.openIssues}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Mais comum</p>
              <p className="text-sm font-semibold text-gray-900">
                {report.byCategory[0] ? ISSUE_CATEGORY_LABELS[report.byCategory[0].category] ?? report.byCategory[0].category : '—'}
              </p>
            </div>
          </div>

          {report.byCategory.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Por tipo</h3>
              <div className="space-y-2">
                {report.byCategory.map((row) => (
                  <div key={row.category} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 text-gray-600 truncate">
                      {ISSUE_CATEGORY_LABELS[row.category] ?? row.category}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-red-400 h-2 rounded-full" style={{ width: `${(row.count / maxCount) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right font-medium text-gray-900">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.recent.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Últimos relatos</h3>
              <ul className="divide-y divide-gray-100">
                {report.recent.map((issue) => (
                  <li key={issue.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-2 justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {ISSUE_CATEGORY_LABELS[issue.category] ?? issue.category}
                        {issue.orderCode && <span className="text-gray-500 font-normal"> · #{issue.orderCode}</span>}
                      </p>
                      {issue.description && <p className="text-sm text-gray-600 break-words">{issue.description}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {issue.customerName ?? 'Cliente'} · {new Date(issue.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    {issue.status === 'open' ? (
                      <button
                        type="button"
                        onClick={() => void resolve(issue.id)}
                        disabled={resolvingId === issue.id}
                        className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 text-white disabled:opacity-50"
                      >
                        {resolvingId === issue.id ? 'Salvando...' : 'Marcar resolvido'}
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-800">
                        Resolvido
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.totalIssues === 0 && (
            <p className="text-gray-400 text-center py-8">Nenhum problema relatado no período.</p>
          )}
        </div>
      )}
    </div>
  )
}
