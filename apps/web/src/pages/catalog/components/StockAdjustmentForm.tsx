import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { SlidersHorizontal } from 'lucide-react'

interface StockAdjustmentFormProps {
  ingredientId: string
  ingredientName: string
}

type MovementType = 'adjustment' | 'loss'
type Direction = 'increase' | 'decrease'

export function StockAdjustmentForm({ ingredientId, ingredientName }: StockAdjustmentFormProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [movementType, setMovementType] = useState<MovementType>('adjustment')
  const [direction, setDirection] = useState<Direction>('increase')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMovement = useMutation({
    mutationFn: (body: unknown) => api.post('/stock-movements', body, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements', ingredientId] })
      setModalOpen(false)
      resetForm()
    },
    onError: (e: Error) => setError(e.message),
  })

  function resetForm() {
    setMovementType('adjustment')
    setDirection('increase')
    setQuantity('')
    setReason('')
    setError(null)
  }

  function submit() {
    if (!quantity || !reason.trim()) {
      setError('Preencha a quantidade e o motivo')
      return
    }
    createMovement.mutate({
      ingredientId,
      movementType,
      direction: movementType === 'adjustment' ? direction : undefined,
      quantity: Number(quantity),
      reason: reason.trim(),
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        <SlidersHorizontal className="h-3 w-3" />
        Ajuste / perda
      </button>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Ajuste de estoque · ${ingredientName}`} size="sm">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as MovementType)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="adjustment">Ajuste (contagem)</option>
              <option value="loss">Perda</option>
            </select>
          </div>
          {movementType === 'adjustment' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Direção</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as Direction)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="increase">Aumentar</option>
                <option value="decrease">Diminuir</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ex: 1.5"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={movementType === 'loss' ? 'Ex: produto vencido' : 'Ex: contagem de inventário'}
              rows={2}
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
              disabled={createMovement.isPending}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50"
            >
              {createMovement.isPending ? 'Aguarde...' : 'Registrar'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
