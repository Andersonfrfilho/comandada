import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

interface DashboardMetrics {
  ordersToday: number
  revenuToday: string
  pendingOrders: number
  cashRegisterOpen: boolean
  cashRegisterId: string | null
}

function MetricCard({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
      <div className={`rounded-xl p-4 md:p-6 ${accent ? 'bg-brand-600 text-white' : 'bg-white shadow-sm'}`}>
      <p className={`text-sm font-medium ${accent ? 'text-brand-100' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent ? 'text-white' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

export function DashboardPage() {
  const accessToken = useAuthStore((state) => state.accessToken)

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => api.get<DashboardMetrics>('/dashboard/metrics', accessToken ?? undefined),
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="p-8 text-gray-500">Carregando...</div>

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <MetricCard label="Pedidos hoje" value={metrics?.ordersToday ?? 0} />
        <MetricCard
          label="Faturamento hoje"
          value={`R$ ${parseFloat(metrics?.revenuToday ?? '0').toFixed(2)}`}
          accent
        />
        <MetricCard label="Pedidos em aberto" value={metrics?.pendingOrders ?? 0} />
        <MetricCard
          label="Caixa"
          value={metrics?.cashRegisterOpen ? 'Aberto' : 'Fechado'}
        />
      </div>
    </div>
  )
}
