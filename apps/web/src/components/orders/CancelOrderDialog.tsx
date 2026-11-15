import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { requiresManualFlag } from '@/pages/orders/orderStatusMoves'
import type { OrderStatus } from '@/constants/orderLabels'

interface CancelOrderDialogProps {
  order: { id: string; status: OrderStatus; label: string } | null
  onClose: () => void
}

const MIN_REASON_LENGTH = 3

/**
 * Cancelar pede confirmação e motivo: o cliente é avisado no WhatsApp, o estoque volta e o
 * pagamento é devolvido. Na lista o botão ficava colado no "→ Concluído" e cancelava com um toque.
 */
export function CancelOrderDialog({ order, onClose }: CancelOrderDialogProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  const cancelMutation = useMutation({
    mutationFn: (target: { id: string; status: OrderStatus }) =>
      api.patch(
        `/orders/${target.id}/status`,
        {
          status: 'cancelled',
          cancellationReason: reason.trim(),
          manual: requiresManualFlag(target.status, 'cancelled') ? true : undefined,
        },
        accessToken ?? undefined
      ),
    onSuccess: () => {
      toast.success(`Pedido ${order?.label ?? ''} cancelado`)
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      setReason('')
      onClose()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const canConfirm = reason.trim().length >= MIN_REASON_LENGTH && !cancelMutation.isPending

  return (
    <Modal open={order !== null} onClose={onClose} title={`Cancelar pedido ${order?.label ?? ''}`} size="sm">
      <div className="space-y-3 p-5">
        <p className="text-sm text-gray-600">
          O cliente é avisado no WhatsApp, o estoque volta e o que foi pago é devolvido.
        </p>
        <label htmlFor="cancel-reason" className="block text-sm font-medium text-gray-700">
          Motivo (obrigatório)
        </label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={300}
          placeholder="Ex.: cliente desistiu, endereço fora da área"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => order && cancelMutation.mutate({ id: order.id, status: order.status })}
            className="rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
          >
            {cancelMutation.isPending ? 'Cancelando…' : 'Cancelar pedido'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
