import { DELIVERY_STATUS_COLORS, DELIVERY_STATUS_LABELS } from '@/constants/statusLabels'
import { formatDeliveryAddress } from '@/lib/deliveryAddress'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { orderNumberLabel } from '@/lib/orderLabel'
import { toast } from '@/stores/toastStore'
import { Banknote, CheckCheck, Clock, ExternalLink, Map as MapIcon, MapPin, MessageCircle, Navigation, Phone, Route, StickyNote } from 'lucide-react'
import { useAuthStore, useCan } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { buildConversationLink } from '@/constants/conversationLinks'
import { paymentChangeAmount, paymentMethodLabel } from '@/constants/paymentLabels'
import {
  formatBrl,
  formatDistance,
  formatDuration,
  formatPhoneBr,
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  googleMapsSearchUrl,
  splitLocationNote,
  type MapPoint,
} from '@/pages/orders/orderDetailFormat'

interface DeliveryOrder {
  id: string
  status: 'pending' | 'dispatched' | 'delivered' | 'failed'
  addressSnapshot: Record<string, string>
  deliverer: { id: string; name: string } | null
  order: {
    id: string
    number: number | null
    code: string | null
    totalAmount: string
    notes: string | null
    estimatedAt: string | null
    scheduledFor: string | null
    items: Array<{ productName: string; quantity: number; notes: string | null }>
    customer: { name: string; whatsappNumber: string } | null
    payments?: Array<{ id: string; paymentTypeName: string; amount: string; changeFor: string | null; splitLabel: string | null }>
    paymentStatus?: string | null
  }
}

const DELIVERY_CHECK_LABELS = {
  title: 'Conferir itens',
  progress: (checked: number, total: number) => `${checked}/${total} conferidos`,
  markAll: 'Marcar todos',
  clear: 'Desmarcar',
  markItem: (name: string) => `Conferir ${name}`,
} as const

/**
 * Conferência da sacola antes de sair: só ajuda o entregador, não muda o pedido, então fica no aparelho
 * (some sozinha quando a entrega sai da fila). Sem armazenamento disponível, vale só enquanto a tela está aberta.
 */
function useCheckedItems(deliveryId: string): [ReadonlySet<number>, (next: ReadonlySet<number>) => void] {
  const storageKey = `delivery-checked:${deliveryId}`
  const [checked, setCheckedState] = useState<ReadonlySet<number>>(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
      return new Set(Array.isArray(saved) ? saved.filter((value): value is number => typeof value === 'number') : [])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    try {
      if (checked.size === 0) window.localStorage.removeItem(storageKey)
      else window.localStorage.setItem(storageKey, JSON.stringify([...checked]))
    } catch {
      // Sem armazenamento: a marcação vale só nesta tela.
    }
  }, [checked, storageKey])
  return [checked, setCheckedState]
}

interface OrderRoute {
  origin: MapPoint | null
  destination: MapPoint | null
  distanceKm: number | null
  durationMin: number | null
  source: 'route' | 'straight_line' | null
}




function formatTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value)
  )
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

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Entregas</h1>
      <div className="space-y-3">
        {deliveries.map((delivery) => (
          <DeliveryCard
            key={delivery.id}
            delivery={delivery}
            couriers={couriers}
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
        {deliveries.length === 0 && <p className="text-gray-400 text-center py-12">Nenhuma entrega ativa</p>}
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

interface Courier {
  id: string
  name: string
}

function DeliveryCard({
  delivery,
  couriers,
  busy,
  onUpdateStatus,
  onFail,
  onAssign,
}: {
  delivery: DeliveryOrder
  couriers: Courier[]
  busy: boolean
  onUpdateStatus: (status: DeliveryOrder['status']) => void
  onFail: () => void
  onAssign: (delivererId: string | null) => void
}) {
  const canOpenOrder = useCan({ resource: 'orders', action: 'write' })
  const accessToken = useAuthStore((state) => state.accessToken)
  // Entregador não acessa Conversas: o botão levava a uma tela proibida.
  const canChat = useCan({ resource: 'conversations', action: 'read' })
  const [showMap, setShowMap] = useState(false)
  const { order } = delivery
  const address = formatDeliveryAddress(delivery.addressSnapshot)
  const complement = delivery.addressSnapshot['complement']
  const notes = splitLocationNote(order.notes).notes
  const payments = order.payments ?? []
  const paidOnline = order.paymentStatus === 'paid'
  const [checked, setChecked] = useCheckedItems(delivery.id)
  const checkedCount = order.items.filter((_, index) => checked.has(index)).length

  function toggleChecked(index: number) {
    const next = new Set(checked)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setChecked(next)
  }

  const { data: route } = useQuery({
    queryKey: ['order-route', order.id],
    queryFn: () => api.get<OrderRoute>(`/orders/${order.id}/route`, accessToken ?? undefined),
    // Endereço do pedido não muda: uma consulta por pedido basta.
    staleTime: Infinity,
    retry: false,
  })
  const destination = route?.destination ?? null
  const distance = formatDistance(route?.distanceKm)
  const duration = formatDuration(route?.durationMin)

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${DELIVERY_STATUS_COLORS[delivery.status]}`}>
              {DELIVERY_STATUS_LABELS[delivery.status]}
            </span>
            {canOpenOrder ? (
              <Link to={`/orders/${order.id}`} className="text-base font-extrabold text-gray-900 hover:underline truncate">
                {orderNumberLabel(order)}
              </Link>
            ) : (
              <span className="text-base font-extrabold text-gray-900">{orderNumberLabel(order)}</span>
            )}
          </div>
          <span className="text-base font-bold text-gray-900 whitespace-nowrap">{formatBrl(order.totalAmount)}</span>
        </div>

        {order.customer && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{order.customer.name}</p>
              <a
                href={`tel:+${order.customer.whatsappNumber.replace(/\D/g, '')}`}
                className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
              >
                <Phone className="h-3.5 w-3.5" />
                {formatPhoneBr(order.customer.whatsappNumber)}
              </a>
            </div>
            {canChat && (
            <Link
              to={buildConversationLink(order.customer.whatsappNumber)}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-brand-600 px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Conversar
            </Link>
            )}
          </div>
        )}

        <div className="mb-3 flex items-start gap-2">
          <MapPin className="h-4 w-4 text-brand-600 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 text-sm">
            <p className="text-gray-800">{address}</p>
            {complement && <p className="text-gray-600 font-medium">{complement}</p>}
            {(distance || duration) && (
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                {distance && (
                  <span className="inline-flex items-center gap-1">
                    <Route className="h-3 w-3" />
                    {distance}
                    {route?.source === 'straight_line' ? ' em linha reta' : ''}
                  </span>
                )}
                {duration && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />~{duration} de carro
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          <a
            href={googleMapsDirectionsUrl(address, destination)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-2 py-2 text-xs font-medium text-white hover:bg-brand-700"
          >
            <Navigation className="h-3.5 w-3.5" />
            Rota
          </a>
          <button
            type="button"
            onClick={() => setShowMap((current) => !current)}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <MapIcon className="h-3.5 w-3.5" />
            {showMap ? 'Esconder mapa' : 'Ver mapa'}
          </button>
          <a
            href={googleMapsSearchUrl(address, destination)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Maps
          </a>
        </div>

        {showMap && (
          <iframe
            title={`Mapa: ${address}`}
            src={googleMapsEmbedUrl(address, destination)}
            className="mb-3 block h-52 w-full rounded-lg border-0 bg-gray-100"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}

        <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2">
          <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-500">
            <Banknote className="h-3.5 w-3.5" />
            {paidOnline ? 'Pago online, não cobrar' : 'Cobrar na entrega'}
          </p>
          {payments.length === 0 && <p className="text-sm text-gray-500">Forma de pagamento não informada</p>}
          {payments.map((payment) => (
            <div key={payment.id} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-gray-800">
                  {paymentMethodLabel(payment.paymentTypeName)}
                  {payment.splitLabel ? ` · ${payment.splitLabel}` : ''}
                </span>
                <span className="text-gray-700 whitespace-nowrap">{formatBrl(payment.amount)}</span>
              </div>
              {!paidOnline && paymentChangeAmount(payment) !== undefined && (
                // Troco em destaque: é o que o entregador precisa separar antes de sair.
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                  <span className="text-xs text-amber-800">Cliente paga com <span className="whitespace-nowrap">{formatBrl(payment.changeFor ?? '0')}</span></span>
                  <span className="whitespace-nowrap text-sm font-bold text-amber-900">
                    Levar troco {formatBrl(paymentChangeAmount(payment) ?? 0)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Conferência do entregador antes de sair, no estilo da Cozinha. Fica só neste aparelho. */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{DELIVERY_CHECK_LABELS.title}</span>
              {' · '}
              <span className="font-semibold tabular-nums text-gray-800">
                {DELIVERY_CHECK_LABELS.progress(checkedCount, order.items.length)}
              </span>
            </p>
            {checkedCount < order.items.length ? (
              <button
                type="button"
                onClick={() => setChecked(new Set(order.items.map((_, index) => index)))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 active:scale-95"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {DELIVERY_CHECK_LABELS.markAll}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setChecked(new Set())}
                className="text-xs font-medium text-gray-500 underline-offset-2 hover:underline"
              >
                {DELIVERY_CHECK_LABELS.clear}
              </button>
            )}
          </div>
          <progress
            value={checkedCount}
            max={Math.max(order.items.length, 1)}
            aria-label={DELIVERY_CHECK_LABELS.progress(checkedCount, order.items.length)}
            className="mb-1 h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-green-500 [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:bg-green-500 [&::-webkit-progress-value]:transition-all"
          />
          <ul className="divide-y divide-gray-100">
            {order.items.map((item, index) => {
              const isChecked = checked.has(index)
              return (
                <li key={`${item.productName}-${index}`}>
                  <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleChecked(index)}
                      aria-label={DELIVERY_CHECK_LABELS.markItem(item.productName)}
                      className="h-6 w-6 flex-shrink-0 cursor-pointer rounded accent-green-600"
                    />
                    <span className={`min-w-0 flex-1 ${isChecked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      <span className="font-semibold">{item.quantity}×</span> {item.productName}
                      {item.notes && <span className="block text-xs italic text-gray-400">{item.notes}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>

        {notes && (
          <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <StickyNote className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="whitespace-pre-line">{notes}</span>
          </p>
        )}

        {(order.scheduledFor || order.estimatedAt) && (
          <p className="mb-3 text-xs text-gray-500">
            {order.scheduledFor
              ? `Encomenda para ${formatTime(order.scheduledFor)}`
              : `Previsão prometida ao cliente: ${formatTime(order.estimatedAt!)}`}
          </p>
        )}

        {couriers.length > 0 ? (
          <label className="mb-3 flex items-center gap-2 text-xs text-gray-500">
            Entregador
            <select
              value={delivery.deliverer?.id ?? ''}
              disabled={busy}
              onChange={(event) => onAssign(event.target.value || null)}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800"
            >
              <option value="">Ninguém ainda (quem sair fica registrado)</option>
              {couriers.map((courier) => (
                <option key={courier.id} value={courier.id}>{courier.name}</option>
              ))}
            </select>
          </label>
        ) : (
          delivery.deliverer && (
            <div className="text-xs text-gray-500 mb-3">
              Entregador: <span className="font-medium text-gray-700">{delivery.deliverer.name}</span>
            </div>
          )
        )}

        <div className="flex gap-2">
          {delivery.status === 'pending' && (
            <button
              onClick={() => onUpdateStatus('dispatched')}
              disabled={busy}
              className="w-full py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95 disabled:opacity-50"
            >
              Sair para entrega
            </button>
          )}
          {delivery.status === 'dispatched' && (
            // "Não entregue" separado e discreto: antes ficava colado em "Entregue", do mesmo tamanho.
            <div className="flex w-full items-center gap-3">
              <button
                onClick={() => onUpdateStatus('delivered')}
                disabled={busy}
                className="flex-1 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                Entregue
              </button>
              <button
                onClick={onFail}
                disabled={busy}
                className="px-3 py-2.5 text-sm font-medium text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Não entregue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
