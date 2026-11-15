import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, type OrderStatus } from '@/constants/orderLabels'
import { resolveSteps } from './OrderProgressBar'
import { classifyStatusMove, nextStatus, type StatusMoveKind } from './orderStatusMoves'

const MOVE_WARNINGS: Record<Exclude<StatusMoveKind, 'forward'>, string> = {
  skip: 'Vai pular etapas. O histórico registra que foi uma mudança manual.',
  back: 'Vai voltar o pedido para uma etapa anterior. O cliente não recebe mensagem dessa correção.',
  cancel: 'O pedido será cancelado e o cliente avisado pelo WhatsApp.',
  reopen: 'O pedido cancelado volta a valer e reaparece nas filas.',
}

interface OrderStatusControlProps {
  orderId: string
  orderType: string
  status: OrderStatus
}

/** Avançar para o próximo passo com um toque; qualquer outro status com confirmação e motivo. */
export function OrderStatusControl({ orderId, orderType, status }: OrderStatusControlProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<OrderStatus | null>(null)
  const [note, setNote] = useState('')

  const steps = resolveSteps(orderType)
  const options: OrderStatus[] = [...steps, 'cancelled']
  const next = nextStatus(steps, status)
  const moveKind = target ? classifyStatusMove(steps, status, target) : null

  const move = useMutation({
    mutationFn: (variables: { to: OrderStatus; note?: string }) => {
      const kind = classifyStatusMove(steps, status, variables.to)
      const reason = variables.note?.trim() || undefined
      return api.patch(
        `/orders/${orderId}/status`,
        {
          status: variables.to,
          manual: kind !== 'forward' && kind !== 'cancel' ? true : undefined,
          note: reason,
          cancellationReason: variables.to === 'cancelled' ? reason ?? 'Cancelado no painel' : undefined,
        },
        accessToken ?? undefined
      )
    },
    onSuccess: () => {
      setTarget(null)
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  function choose(to: OrderStatus) {
    if (to === status) return
    move.reset()
    if (classifyStatusMove(steps, status, to) === 'forward' && to !== 'cancelled') {
      move.mutate({ to })
      return
    }
    setTarget(to)
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {next && (
          <button
            type="button"
            disabled={move.isPending}
            onClick={() => choose(next)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-gray-300"
          >
            Avançar para {ORDER_STATUS_LABELS[next]}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <span>Mudar para</span>
          <select
            value=""
            disabled={move.isPending}
            onChange={(event) => choose(event.target.value as OrderStatus)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-800"
          >
            <option value="" disabled>
              escolha o status…
            </option>
            {options.map((option) => (
              <option key={option} value={option} disabled={option === status}>
                {ORDER_STATUS_LABELS[option]}
                {option === status ? ' (atual)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {move.isError && !target && (
        <p className="mt-2 text-sm text-red-700">{move.error instanceof Error ? move.error.message : 'Não foi possível mudar o status.'}</p>
      )}

      <Modal open={target !== null} onClose={() => setTarget(null)} title="Mudar status do pedido?" size="md">
        {target && moveKind && moveKind !== 'forward' && (
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ORDER_STATUS_COLORS[status]}`}>
                {ORDER_STATUS_LABELS[status]}
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ORDER_STATUS_COLORS[target]}`}>
                {ORDER_STATUS_LABELS[target]}
              </span>
            </div>
            <p className={`rounded px-3 py-2 text-sm ${moveKind === 'cancel' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
              {MOVE_WARNINGS[moveKind]}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">
                {moveKind === 'cancel' ? 'Motivo do cancelamento' : 'Motivo (opcional, vai para o histórico)'}
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            {move.isError && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {move.error instanceof Error ? move.error.message : 'Não foi possível mudar o status.'}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={move.isPending || (moveKind === 'cancel' && note.trim().length === 0)}
                onClick={() => move.mutate({ to: target, note })}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300 ${
                  moveKind === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {move.isPending ? 'Salvando...' : `Mudar para ${ORDER_STATUS_LABELS[target]}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
