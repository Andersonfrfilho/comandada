import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bike } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { orderNumberLabel } from '@/lib/orderLabel'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { DeliveryCard, type Courier, type DeliveryOrder } from './DeliveryCard'
import { DELIVERY_GROUP_LABELS, DELIVERY_GROUP_ORDER, groupDeliveries } from './deliveryQueue'

const DELIVERY_PAGE_LABELS = {
  title: 'Entregas',
  emptyTitle: 'Nenhuma entrega agora',
  emptyHint: 'Os pedidos de entrega aparecem aqui assim que entram, já separados entre prontos e na cozinha.',
} as const

/** Relógio da tela: o "faltam X min" anda sozinho sem esperar a fila recarregar. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

export function DeliveryPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const { data: deliveries = [] } = useQuery({
    queryKey: ['delivery', 'queue'],
    queryFn: () => api.get<DeliveryOrder[]>('/delivery/queue', accessToken ?? undefined),
    refetchInterval: 20_000,
  })

  useWebSocket((message) => {
    if (message.type.startsWith('delivery:') || message.type.startsWith('order:')) {
      void queryClient.invalidateQueries({ queryKey: ['delivery', 'queue'] })
    }
  })

  // Erro vira aviso na tela e o botão trava até a resposta (antes um 422 só "não fazia nada").
  const statusMutation = useMutation({
    mutationFn: ({ deliveryId, status, note }: StatusChange) =>
      api.patch(`/delivery/${deliveryId}/status`, { status, ...(note ? { note } : {}) }, accessToken ?? undefined),
    onSuccess: (_result, variables) => {
      if (variables.status === 'delivered') toast.success('Entrega concluída')
      if (variables.status === 'failed') toast.info('Entrega marcada como não feita')
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['delivery', 'queue'] }),
  })
  const assignMutation = useMutation({
    mutationFn: ({ deliveryId, delivererId }: { deliveryId: string; delivererId: string | null }) =>
      api.patch(`/delivery/${deliveryId}/assign`, { delivererId }, accessToken ?? undefined),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['delivery', 'queue'] }),
  })
  const { data: couriers = [] } = useQuery({
    queryKey: ['delivery', 'couriers'],
    queryFn: () => api.get<Courier[]>('/delivery/couriers', accessToken ?? undefined),
    staleTime: 5 * 60_000,
  })
  const [failTarget, setFailTarget] = useState<DeliveryOrder | null>(null)
  const [failReason, setFailReason] = useState('')
  const now = useNow(30_000)
  const groups = groupDeliveries(deliveries)

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold text-gray-900">{DELIVERY_PAGE_LABELS.title}</h1>
        {deliveries.length > 0 && (
          <p className="text-sm text-gray-500">
            {DELIVERY_GROUP_ORDER.filter((key) => groups[key].length > 0)
              .map((key) => DELIVERY_GROUP_LABELS[key].summary(groups[key].length))
              .join(' · ')}
          </p>
        )}
      </div>

      {deliveries.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-gray-100">
          <Bike className="h-10 w-10 text-gray-300" aria-hidden="true" />
          <p className="font-semibold text-gray-700">{DELIVERY_PAGE_LABELS.emptyTitle}</p>
          <p className="max-w-xs text-sm text-gray-500">{DELIVERY_PAGE_LABELS.emptyHint}</p>
        </div>
      )}

      <div className="space-y-6">
        {DELIVERY_GROUP_ORDER.filter((key) => groups[key].length > 0).map((key) => (
          <section key={key} aria-labelledby={`delivery-group-${key}`}>
            <h2 id={`delivery-group-${key}`} className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500">
              {DELIVERY_GROUP_LABELS[key].title}
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-700">{groups[key].length}</span>
            </h2>
            <div className="space-y-3">
              {groups[key].map((delivery) => (
                <DeliveryCard
                  key={delivery.id}
                  delivery={delivery}
                  couriers={couriers}
                  now={now}
                  busy={
                    (statusMutation.isPending && statusMutation.variables?.deliveryId === delivery.id) ||
                    (assignMutation.isPending && assignMutation.variables?.deliveryId === delivery.id)
                  }
                  onUpdateStatus={(status) => statusMutation.mutate({ deliveryId: delivery.id, status })}
                  onFail={() => {
                    setFailReason('')
                    setFailTarget(delivery)
                  }}
                  onAssign={(delivererId) => assignMutation.mutate({ deliveryId: delivery.id, delivererId })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <Modal
        open={failTarget !== null}
        onClose={() => setFailTarget(null)}
        title={`Não entregue ${failTarget ? orderNumberLabel(failTarget.order) : ''}`}
        size="sm"
      >
        <div className="space-y-3 p-5">
          <label htmlFor="fail-reason" className="block text-sm font-medium text-gray-700">
            O que aconteceu? (obrigatório)
          </label>
          <textarea
            id="fail-reason"
            value={failReason}
            onChange={(event) => setFailReason(event.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Ex.: cliente não atendeu, endereço não encontrado"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFailTarget(null)}
              className="rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={failReason.trim().length < 3 || statusMutation.isPending}
              onClick={() => {
                if (!failTarget) return
                statusMutation.mutate(
                  { deliveryId: failTarget.id, status: 'failed', note: failReason.trim() },
                  { onSuccess: () => setFailTarget(null) }
                )
              }}
              className="rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

interface StatusChange {
  deliveryId: string
  status: DeliveryOrder['status']
  note?: string
}
