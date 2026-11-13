import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Plus, AlertTriangle } from 'lucide-react'

interface StockBatch {
  id: string
  ingredientId: string
  batchNumber: string
  quantity: string
  remainingQuantity: string
  costPerUnit: string
  expiresAt: string
  createdAt: string
}

interface StockBatchListProps {
  ingredientId: string
  ingredientName: string
}

function toNumber(value: string): number {
  return Number(value) || 0
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getExpiryBadge(expiresAt: string | null): { label: string; color: string } | null {
  if (!expiresAt) return null
  const days = daysUntil(expiresAt)
  if (days < 0) return { label: 'Vencido', color: 'text-red-600 bg-red-50' }
  if (days <= 7) return { label: `Vence em ${days}d`, color: 'text-yellow-600 bg-yellow-50' }
  return null
}

export function StockBatchList({ ingredientId, ingredientName }: StockBatchListProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [formBatchNumber, setFormBatchNumber] = useState('')
  const [formQuantity, setFormQuantity] = useState('')
  const [formCostPerUnit, setFormCostPerUnit] = useState('')
  const [formExpiresAt, setFormExpiresAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: batches = [] } = useQuery({
    queryKey: ['stock-batches', ingredientId],
    queryFn: () =>
      api.get<StockBatch[]>(`/stock-batches?ingredientId=${ingredientId}`, accessToken ?? undefined),
  })

  const createBatch = useMutation({
    mutationFn: (body: unknown) => api.post('/stock-batches', body, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-batches', ingredientId] })
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      setModalOpen(false)
      resetForm()
    },
    onError: (e: Error) => setError(e.message),
  })

  function resetForm() {
    setFormBatchNumber('')
    setFormQuantity('')
    setFormCostPerUnit('')
    setFormExpiresAt('')
    setError(null)
  }

  function submit() {
    if (!formBatchNumber || !formQuantity || !formCostPerUnit || !formExpiresAt) {
      setError('Preencha número do lote, quantidade, custo unitário e validade')
      return
    }
    createBatch.mutate({
      ingredientId,
      batchNumber: formBatchNumber,
      quantity: Number(formQuantity),
      costPerUnit: Number(formCostPerUnit),
      expiresAt: formExpiresAt,
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">
          Lotes de <strong>{ingredientName}</strong>
        </span>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-3 w-3" />
          Entrada
        </button>
      </div>

      {batches.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Nenhum lote registrado</p>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-1.5 font-medium">Lote</th>
                <th className="px-3 py-1.5 font-medium">Qtd original</th>
                <th className="px-3 py-1.5 font-medium">Restante</th>
                <th className="px-3 py-1.5 font-medium">Custo un.</th>
                <th className="px-3 py-1.5 font-medium">Validade</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const badge = getExpiryBadge(batch.expiresAt)
                return (
                  <tr key={batch.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-800">{batch.batchNumber}</td>
                    <td className="px-3 py-1.5 text-gray-800">{toNumber(batch.quantity).toFixed(4)}</td>
                    <td className="px-3 py-1.5 text-gray-600">{toNumber(batch.remainingQuantity).toFixed(4)}</td>
                    <td className="px-3 py-1.5 text-gray-600">R$ {toNumber(batch.costPerUnit).toFixed(4)}</td>
                    <td className="px-3 py-1.5">
                      {badge ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}>
                          {badge.label}
                        </span>
                      ) : batch.expiresAt ? (
                        <span className="text-gray-500">{new Date(batch.expiresAt).toLocaleDateString('pt-BR')}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Entrada · ${ingredientName}`} size="sm">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número do lote</label>
            <input
              type="text"
              value={formBatchNumber}
              onChange={(e) => setFormBatchNumber(e.target.value)}
              placeholder="Ex: LOTE-2026-001"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={formQuantity}
              onChange={(e) => setFormQuantity(e.target.value)}
              placeholder="Ex: 10.0"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Custo unitário (R$)</label>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={formCostPerUnit}
              onChange={(e) => setFormCostPerUnit(e.target.value)}
              placeholder="Ex: 4.50"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
            <input
              type="date"
              value={formExpiresAt}
              onChange={(e) => setFormExpiresAt(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={createBatch.isPending}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50"
            >
              {createBatch.isPending ? 'Aguarde...' : 'Registrar entrada'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export function ExpiringBatchBadge({ className = '' }: { className?: string }) {
  const accessToken = useAuthStore((state) => state.accessToken)

  const { data, isLoading } = useQuery({
    queryKey: ['stock-batches-expiring-count'],
    queryFn: () => api.get<{ count: number; alertDays: number }>('/stock-batches/expiring/count', accessToken ?? undefined),
    refetchInterval: 300_000,
  })

  if (isLoading || !data || data.count === 0) return null

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded-full ${className}`}>
      <AlertTriangle className="h-3 w-3" />
      {data.count} lote{data.count !== 1 ? 's' : ''} vencendo
    </span>
  )
}
