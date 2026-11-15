import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Pagination } from '@/components/ui/Pagination'

interface StockMovement {
  id: string
  movementType: string
  quantity: string
  reason: string | null
  userName: string | null
  orderId: string | null
  createdAt: string
}

interface StockMovementsPage {
  data: StockMovement[]
  total: number
}

const MOVEMENTS_PAGE_SIZE = 10

interface StockMovementHistoryProps {
  ingredientId: string
}

const MOVEMENT_LABELS: Record<string, { label: string; color: string }> = {
  in: { label: 'Entrada', color: 'text-green-600' },
  out: { label: 'Saída', color: 'text-gray-500' },
  adjustment: { label: 'Ajuste', color: 'text-blue-600' },
  loss: { label: 'Perda', color: 'text-red-600' },
}

function toNumber(value: string): number {
  return Number(value) || 0
}

function formatQuantity(movementType: string, quantity: string): string {
  const value = toNumber(quantity)
  const sign = value > 0 ? '+' : ''
  return movementType === 'adjustment' || movementType === 'loss' ? `${sign}${value.toFixed(4)}` : value.toFixed(4)
}

export function StockMovementHistory({ ingredientId }: StockMovementHistoryProps) {
  const accessToken = useAuthStore((state) => state.accessToken)

  const [page, setPage] = useState(1)
  const [movementType, setMovementType] = useState('')

  const params = new URLSearchParams({ ingredientId, page: String(page), pageSize: String(MOVEMENTS_PAGE_SIZE) })
  if (movementType) params.set('movementType', movementType)

  const { data } = useQuery({
    queryKey: ['stock-movements', ingredientId, page, movementType],
    queryFn: () => api.get<StockMovementsPage>(`/stock-movements?${params.toString()}`, accessToken ?? undefined),
    placeholderData: (previous) => previous,
  })
  const movements = data?.data ?? []
  const total = data?.total ?? 0

  if (total === 0 && !movementType) {
    return <p className="text-xs text-gray-400 italic mt-3">Nenhuma movimentação registrada</p>
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-500">Histórico de movimentações</span>
        <select
          value={movementType}
          onChange={(event) => {
            setMovementType(event.target.value)
            setPage(1)
          }}
          aria-label="Filtrar movimentações por tipo"
          className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(MOVEMENT_LABELS).map(([value, info]) => (
            <option key={value} value={value}>{info.label}</option>
          ))}
        </select>
      </div>
      <div className="border border-gray-200 rounded-xl overflow-hidden mt-1">
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-1.5 font-medium">Tipo</th>
                <th className="px-3 py-1.5 font-medium">Qtd</th>
                <th className="px-3 py-1.5 font-medium">Motivo</th>
                <th className="px-3 py-1.5 font-medium">Usuário</th>
                <th className="px-3 py-1.5 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => {
                const typeInfo = MOVEMENT_LABELS[movement.movementType] ?? { label: movement.movementType, color: 'text-gray-600' }
                return (
                  <tr key={movement.id} className="border-t border-gray-100">
                    <td className={`px-3 py-1.5 font-medium ${typeInfo.color}`}>{typeInfo.label}</td>
                    <td className="px-3 py-1.5 text-gray-800">{formatQuantity(movement.movementType, movement.quantity)}</td>
                    <td className="px-3 py-1.5 text-gray-600">{movement.reason ?? (movement.orderId ? 'Pedido' : '-')}</td>
                    <td className="px-3 py-1.5 text-gray-600">{movement.userName ?? '-'}</td>
                    <td className="px-3 py-1.5 text-gray-500">
                      {new Date(movement.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                )
              })}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-gray-400">Nenhuma movimentação desse tipo</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={MOVEMENTS_PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>
    </div>
  )
}
