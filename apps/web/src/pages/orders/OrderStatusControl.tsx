import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ChevronsRight, RotateCcw, Undo2, XCircle, type LucideIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, type OrderStatus } from '@/constants/orderLabels'
import { resolveSteps } from './OrderProgressBar'
import {
  classifyStatusMove,
  nextStatus,
  requiresManualFlag,
  statusChoices,
  type StatusChoiceGroup,
  type StatusMoveKind,
} from './orderStatusMoves'
import { REFUND_COPY, type OrderPaymentSummary } from '@/constants/onlinePayments'
import { orderPaymentsQueryKey, refundErrorMessage } from './OrderPaymentCard'
import { formatBrl } from './orderDetailFormat'

const MOVE_WARNINGS: Record<Exclude<StatusMoveKind, 'forward'>, string> = {
  skip: 'Vai pular etapas. O histórico registra que foi uma mudança manual.',
  back: 'Vai voltar o pedido para uma etapa anterior. O cliente não recebe mensagem dessa correção.',
  cancel: 'O pedido será cancelado e o cliente avisado pelo WhatsApp. O que a receita tirou do estoque volta para o estoque.',
  reopen: 'O pedido cancelado volta a valer e reaparece nas filas.',
}

const GROUP_LABELS: Record<StatusChoiceGroup, string> = {
  skip: 'Pular para',
  back: 'Voltar para',
  reopen: 'Reabrir como',
}

const GROUP_ICONS: Record<StatusChoiceGroup, LucideIcon> = {
  skip: ChevronsRight,
  back: Undo2,
  reopen: RotateCcw,
}

interface OrderStatusControlProps {
  orderId: string
  orderType: string
  status: OrderStatus
  /** Pedido de iFood/99Food: o cancelamento sai pelo quadro da plataforma (com o motivo que ela aceita). */
  platformCancelLabel?: string | null
}

/**
 * Avançar para o próximo passo com um toque; os outros status viram botões separados por tipo
 * (pular, voltar, reabrir, cancelar), com confirmação e motivo quando não é o caminho natural.
 */
export function OrderStatusControl({ orderId, orderType, status, platformCancelLabel }: OrderStatusControlProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<OrderStatus | null>(null)
  const [note, setNote] = useState('')
  const [refundOnCancel, setRefundOnCancel] = useState(true)
  const [refundFailure, setRefundFailure] = useState<string | null>(null)

  // Mesmo dado do quadro de pagamento (cache compartilhado): o cancelamento oferece devolver o que foi pago.
  const { data: paymentSummary } = useQuery({
    queryKey: orderPaymentsQueryKey(orderId),
    queryFn: () => api.get<OrderPaymentSummary>(`/orders/${orderId}/payments`, accessToken ?? undefined),
  })
  const refundable = Number(paymentSummary?.refundable ?? 0)
  const canRefundOnCancel = refundable > 0 && paymentSummary?.refundMode !== 'none'

  const steps = resolveSteps(orderType)
  const choices = statusChoices(steps, status)
  const next = nextStatus(steps, status)
  const moveKind = target ? classifyStatusMove(steps, status, target) : null

  const move = useMutation({
    mutationFn: async (variables: { to: OrderStatus; note?: string; refund?: boolean }) => {
      const reason = variables.note?.trim() || undefined
      await api.patch(
        `/orders/${orderId}/status`,
        {
          status: variables.to,
          manual: requiresManualFlag(status, variables.to) ? true : undefined,
          note: reason,
          cancellationReason: variables.to === 'cancelled' ? reason ?? 'Cancelado no painel' : undefined,
        },
        accessToken ?? undefined
      )
      // Cancelou: o pedido já está cancelado. Se a devolução falhar, avisa e o botão fica no quadro de pagamento.
      if (variables.to === 'cancelled' && variables.refund) {
        try {
          await api.post(`/orders/${orderId}/refunds`, { reason: reason ?? 'Pedido cancelado' }, accessToken ?? undefined)
        } catch (error) {
          setRefundFailure(REFUND_COPY.cancelRefundFailed(refundErrorMessage(error)))
        }
      }
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
    setRefundFailure(null)
    setRefundOnCancel(true)
    if (classifyStatusMove(steps, status, to) === 'forward' && to !== 'cancelled') {
      move.mutate({ to })
      return
    }
    setTarget(to)
  }

  const rowClass = 'flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3'
  const rowLabelClass = 'text-xs font-medium text-gray-500 sm:w-24 sm:flex-shrink-0'

  function renderChip(option: OrderStatus, group: StatusChoiceGroup) {
    const Icon = GROUP_ICONS[group]
    return (
      <button
        key={option}
        type="button"
        disabled={move.isPending}
        onClick={() => choose(option)}
        aria-label={`${GROUP_LABELS[group]} ${ORDER_STATUS_LABELS[option]}`}
        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset ring-black/5 transition hover:ring-2 hover:ring-black/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${ORDER_STATUS_COLORS[option]}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {ORDER_STATUS_LABELS[option]}
      </button>
    )
  }

  function renderGroup(group: StatusChoiceGroup, items: OrderStatus[]) {
    if (items.length === 0) return null
    return (
      <div className={rowClass}>
        <span className={rowLabelClass}>{GROUP_LABELS[group]}</span>
        <div className="flex flex-wrap gap-2">{items.map((option) => renderChip(option, group))}</div>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
      {next && (
        <button
          type="button"
          disabled={move.isPending}
          onClick={() => choose(next)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98] disabled:bg-gray-300 sm:w-auto"
        >
          {move.isPending ? 'Salvando...' : `Avançar para ${ORDER_STATUS_LABELS[next]}`}
          {!move.isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}
      <div className="space-y-2.5 rounded-lg bg-gray-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {next ? 'Ou corrija o status' : 'Mudar o status'}
        </p>
        {renderGroup('skip', choices.skip)}
        {renderGroup('back', choices.back)}
        {renderGroup('reopen', choices.reopen)}
        {choices.canCancel && platformCancelLabel && (
          <p className="border-t border-gray-200 pt-2.5 text-xs text-gray-500">
            Para cancelar, use "Cancelar no {platformCancelLabel}" no quadro da plataforma: o pedido fecha quando ela confirmar.
          </p>
        )}
        {choices.canCancel && !platformCancelLabel && (
          <div className="border-t border-gray-200 pt-2.5">
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => choose('cancelled')}
              className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Cancelar pedido
            </button>
          </div>
        )}
      </div>
      {refundFailure && !target && <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{refundFailure}</p>}
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
            {moveKind === 'cancel' && canRefundOnCancel && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={refundOnCancel} onChange={(event) => setRefundOnCancel(event.target.checked)} />
                {REFUND_COPY.cancelCheckbox(formatBrl(refundable))}
              </label>
            )}
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
                onClick={() => move.mutate({ to: target, note, refund: moveKind === 'cancel' && canRefundOnCancel && refundOnCancel })}
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
