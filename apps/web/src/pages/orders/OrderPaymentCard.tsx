import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api, ApiError } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { paymentChangeText, paymentMethodLabel } from '@/constants/paymentLabels'
import {
  CHARGE_KIND_LABELS,
  CHARGE_STATUS_LABELS,
  ONLINE_PAYMENT_STATUS,
  REFUND_COPY,
  REFUND_STATUS_LABELS,
  type OrderPaymentSummary,
} from '@/constants/onlinePayments'
import { formatBrl } from './orderDetailFormat'

interface OrderPaymentLine {
  id: string
  paymentTypeName: string
  amount: string
  changeFor: string | null
  splitLabel: string | null
}

interface OrderPaymentCardProps {
  orderId: string
  orderCancelled: boolean
  payments: OrderPaymentLine[]
}

export function orderPaymentsQueryKey(orderId: string) {
  return ['order', orderId, 'payments'] as const
}

export function refundErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return REFUND_COPY.forbidden
  return error instanceof Error ? error.message : REFUND_COPY.genericError
}

/** Formas de pagamento do pedido, a cobrança online (Pix/link) e o que já voltou para o cliente. */
export function OrderPaymentCard({ orderId, orderCancelled, payments }: OrderPaymentCardProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [notifyCustomer, setNotifyCustomer] = useState(true)

  const { data: summary } = useQuery({
    queryKey: orderPaymentsQueryKey(orderId),
    queryFn: () => api.get<OrderPaymentSummary>(`/orders/${orderId}/payments`, accessToken ?? undefined),
  })

  const refundable = Number(summary?.refundable ?? 0)
  const refund = useMutation({
    mutationFn: () => {
      const typed = Number(amount.replace(',', '.'))
      const partial = Number.isFinite(typed) && typed > 0 && typed < refundable
      return api.post<{ cashRecorded: boolean }>(
        `/orders/${orderId}/refunds`,
        { amount: partial ? typed : undefined, reason: reason.trim() || undefined, notifyCustomer },
        accessToken ?? undefined
      )
    },
    onSuccess: () => {
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  function openRefund() {
    refund.reset()
    setAmount(refundable.toFixed(2).replace('.', ','))
    setReason('')
    setNotifyCustomer(true)
    setOpen(true)
  }

  const typedAmount = Number(amount.replace(',', '.'))
  const amountInvalid = !(typedAmount > 0) || typedAmount > refundable + 0.001
  const onlineCharges = summary?.charges ?? []
  const statusLabel = summary ? ONLINE_PAYMENT_STATUS[summary.paymentStatus] : undefined

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Pagamento</h2>
        {statusLabel && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusLabel.className}`}>{statusLabel.label}</span>
        )}
      </div>

      <div className="space-y-2">
        {payments.map((payment) => (
          <div key={payment.id} className="text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-800">
                {paymentMethodLabel(payment.paymentTypeName)}
                {payment.splitLabel ? ` · ${payment.splitLabel}` : ''}
              </span>
              <span className="text-gray-600 whitespace-nowrap">{formatBrl(payment.amount)}</span>
            </div>
            {paymentChangeText(payment) && (
              <p className="text-xs font-medium text-amber-700">{paymentChangeText(payment)}</p>
            )}
          </div>
        ))}
      </div>

      {onlineCharges.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          {onlineCharges.map((charge) => (
            <div key={charge.id} className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-gray-600">
              <span>
                {CHARGE_KIND_LABELS[charge.kind] ?? charge.kind} · {CHARGE_STATUS_LABELS[charge.status] ?? charge.status}
                {charge.providerPaymentId ? ` · Mercado Pago nº ${charge.providerPaymentId}` : ''}
              </span>
              <span className="whitespace-nowrap">{formatBrl(charge.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {summary && Number(summary.paid) > 0 && (
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>Recebido</span>
            <span>{formatBrl(summary.paid)}</span>
          </div>
          {Number(summary.refunded) > 0 && (
            <div className="flex justify-between text-red-700">
              <span>Devolvido</span>
              <span>− {formatBrl(summary.refunded)}</span>
            </div>
          )}
        </div>
      )}

      {(summary?.refunds ?? []).length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          {summary!.refunds.map((item) => (
            <li key={item.id} className="text-xs text-gray-600">
              <span className="font-medium text-gray-800">{formatBrl(item.amount)}</span> ·{' '}
              {item.method === 'online' ? REFUND_COPY.onlineTag : REFUND_COPY.manualTag} ·{' '}
              {REFUND_STATUS_LABELS[item.status] ?? item.status} · {new Date(item.createdAt).toLocaleString('pt-BR')}
              {item.createdBy ? ` · ${item.createdBy}` : ''}
              {item.reason ? <span className="block text-gray-500">{item.reason}</span> : null}
              {item.failureMessage ? <span className="block text-red-700">{item.failureMessage}</span> : null}
            </li>
          ))}
        </ul>
      )}

      {orderCancelled && refundable > 0 && (
        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{REFUND_COPY.cancelledWithMoney(formatBrl(refundable))}</p>
      )}

      {summary && summary.refundMode !== 'none' && (
        <button
          type="button"
          onClick={openRefund}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <RotateCcw className="h-4 w-4" />
          {REFUND_COPY.button}
        </button>
      )}
      {summary && summary.refundMode === 'none' && refundable > 0 && (
        <p className="mt-3 text-xs text-gray-500">{REFUND_COPY.providerOnly}</p>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={REFUND_COPY.modalTitle} size="md">
        {summary && (
          <div className="p-5 space-y-3">
            <p className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {summary.refundMode === 'online' ? REFUND_COPY.onlineExplain : REFUND_COPY.manualExplain}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">
                {REFUND_COPY.amountLabel(formatBrl(refundable))}
              </span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">{REFUND_COPY.reasonLabel}</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={notifyCustomer} onChange={(event) => setNotifyCustomer(event.target.checked)} />
              {REFUND_COPY.notifyLabel}
            </label>
            {refund.isError && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{refundErrorMessage(refund.error)}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={refund.isPending || amountInvalid}
                onClick={() => refund.mutate()}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-gray-300"
              >
                {refund.isPending ? REFUND_COPY.pending : REFUND_COPY.confirm(formatBrl(Number.isFinite(typedAmount) ? typedAmount : 0))}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
