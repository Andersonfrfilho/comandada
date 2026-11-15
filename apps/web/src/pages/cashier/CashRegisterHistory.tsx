import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { formatBRL } from './cashierFormat'

interface ClosedRegister {
  id: string
  openedAt: string
  closedAt: string | null
  closingAmount: string | null
  expectedCashAmount: string | null
  closingDifference: string | null
  closingNotes: string | null
  closedByName: string | null
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function DifferenceBadge({ difference, hidden }: { difference: string | null; hidden: boolean }) {
  // Caixa fechado antes desta versão: não tem o esperado gravado.
  if (difference === null) return <span className="text-xs text-gray-400">sem conferência</span>
  const value = Number(difference)
  if (value === 0) return <span className="text-xs font-semibold text-green-700">bateu</span>
  return (
    <span className={`text-xs font-semibold ${value < 0 ? 'text-red-700' : 'text-amber-700'}`}>
      {value < 0 ? 'falta' : 'sobra'} {formatBRL(Math.abs(value), hidden)}
    </span>
  )
}

export function CashRegisterHistory({ hidden }: { hidden: boolean }) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const { data: registers = [] } = useQuery({
    queryKey: ['cashier-history'],
    queryFn: () => api.get<ClosedRegister[]>('/cashier/registers/history?limit=10', accessToken ?? undefined),
  })

  if (registers.length === 0) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h2 className="font-semibold text-gray-900 mb-3">Últimos fechamentos</h2>
      <ul className="divide-y divide-gray-100">
        {registers.map((register) => (
          <li key={register.id} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-700">{formatDateTime(register.closedAt)}</span>
              <DifferenceBadge difference={register.closingDifference} hidden={hidden} />
            </div>
            <p className="text-xs text-gray-500">
              Contado {formatBRL(register.closingAmount ?? 0, hidden)}
              {register.expectedCashAmount !== null && <> · esperado {formatBRL(register.expectedCashAmount, hidden)}</>}
              {register.closedByName && <> · {register.closedByName}</>}
            </p>
            {register.closingNotes && <p className="text-xs text-gray-500 italic">{register.closingNotes}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
