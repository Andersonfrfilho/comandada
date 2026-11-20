import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Banknote,
  CheckCheck,
  ChevronDown,
  Clock,
  CookingPot,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Route,
  StickyNote,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, type OrderStatus } from '@/constants/orderLabels'
import { buildConversationLink } from '@/constants/conversationLinks'
import { paymentChangeAmount, paymentMethodLabel } from '@/constants/paymentLabels'
import { formatDeliveryAddress } from '@/lib/deliveryAddress'
import { orderNumberLabel } from '@/lib/orderLabel'
import { api } from '@/lib/api'
import { useAuthStore, useCan } from '@/stores/authStore'
import {
  formatBrl,
  formatDistance,
  formatDuration,
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  splitLocationNote,
  type MapPoint,
} from '@/pages/orders/orderDetailFormat'
import { deliveryDeadline, deliveryGroup, sinceLabel, telUrl, whatsappUrl, type DeadlineTone } from './deliveryQueue'
import { Select } from '@/components/ui/Select'

export interface DeliveryOrder {
  id: string
  status: 'pending' | 'dispatched' | 'delivered' | 'failed'
  addressSnapshot: Record<string, string>
  deliverer: { id: string; name: string } | null
  dispatchedAt?: string | null
  createdAt?: string | null
  order: {
    id: string
    number: number | null
    code: string | null
    status?: string | null
    totalAmount: string
    notes: string | null
    estimatedAt: string | null
    scheduledFor: string | null
    createdAt?: string | null
    customerName?: string | null
    items: Array<{ productName: string; quantity: number; notes: string | null }>
    customer: { name: string; whatsappNumber: string } | null
    payments?: Array<{ id: string; paymentTypeName: string; amount: string; changeFor: string | null; splitLabel: string | null }>
    paymentStatus?: string | null
  }
}

export interface Courier {
  id: string
  name: string
}

interface OrderRoute {
  origin: MapPoint | null
  destination: MapPoint | null
  distanceKm: number | null
  durationMin: number | null
  source: 'route' | 'straight_line' | null
}

const DELIVERY_CARD_LABELS = {
  checkTitle: 'Conferir itens',
  progress: (checked: number, total: number) => `${checked}/${total} conferidos`,
  markAll: 'Marcar todos',
  clear: 'Desmarcar',
  markItem: (name: string) => `Conferir ${name}`,
  itemsSummary: (count: number) => (count === 1 ? '1 item' : `${count} itens`),
  route: 'Rota',
  call: 'Ligar',
  whatsapp: 'WhatsApp',
  chat: 'Conversar',
  showMap: 'Ver no mapa',
  hideMap: 'Esconder mapa',
  straightLine: ' em linha reta',
  byCar: (duration: string) => `~${duration} de carro`,
  paidOnline: 'Pago online, não cobrar',
  charge: (amount: string) => `Cobrar ${amount}`,
  noPayment: 'Forma de pagamento não informada',
  customerPays: 'Cliente paga com',
  bringChange: (amount: string) => `Levar troco ${amount}`,
  scheduled: (time: string) => `Encomenda para ${time}`,
  dispatchedSince: (since: string) => `Saiu ${since}`,
  withCourier: (name: string) => `com ${name}`,
  courier: 'Entregador',
  noCourier: 'Ninguém ainda (quem sair fica registrado)',
  stillCooking: 'A cozinha ainda não marcou como pronto.',
  dispatch: 'Saiu para entrega',
  delivered: 'Entregue',
  failed: 'Não entregue',
  noCustomer: 'Cliente sem nome',
} as const

const DEADLINE_CLASSES: Record<DeadlineTone, string> = {
  late: 'bg-red-600 text-white',
  soon: 'bg-amber-100 text-amber-900',
  ok: 'bg-gray-100 text-gray-700',
}

function formatClock(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value)
  )
}

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

function isOrderStatus(value: string | null | undefined): value is OrderStatus {
  return typeof value === 'string' && value in ORDER_STATUS_LABELS
}

export function DeliveryCard({
  delivery,
  couriers,
  busy,
  now,
  onUpdateStatus,
  onFail,
  onAssign,
}: {
  delivery: DeliveryOrder
  couriers: Courier[]
  busy: boolean
  now: number
  onUpdateStatus: (status: DeliveryOrder['status']) => void
  onFail: () => void
  onAssign: (delivererId: string | null) => void
}) {
  const canOpenOrder = useCan({ resource: 'orders', action: 'write' })
  const accessToken = useAuthStore((state) => state.accessToken)
  // Entregador não acessa Conversas: para ele o botão abre o WhatsApp do aparelho.
  const canChat = useCan({ resource: 'conversations', action: 'read' })
  const [showMap, setShowMap] = useState(false)
  const { order } = delivery
  const group = deliveryGroup(delivery)
  const onRoute = group === 'on_route'
  const address = formatDeliveryAddress(delivery.addressSnapshot)
  const complement = delivery.addressSnapshot['complement']
  const notes = splitLocationNote(order.notes).notes
  const payments = order.payments ?? []
  const paidOnline = order.paymentStatus === 'paid'
  const customerName = order.customer?.name ?? order.customerName ?? null
  const phone = order.customer?.whatsappNumber ?? null
  const deadline = deliveryDeadline(delivery, now, formatClock)
  const [checked, setChecked] = useCheckedItems(delivery.id)
  const checkedCount = order.items.filter((_, index) => checked.has(index)).length
  // Em rota a sacola já foi conferida: os itens ficam recolhidos para o cartão caber na tela.
  const [itemsOpen, setItemsOpen] = useState(!onRoute)
  useEffect(() => setItemsOpen(!onRoute), [onRoute])

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
  const dispatchedSince = onRoute ? sinceLabel(delivery.dispatchedAt, now) : null

  const numberLabel = orderNumberLabel(order)
  const actionButton = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition-colors active:scale-95'

  return (
    <article
      className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${deadline?.tone === 'late' ? 'ring-red-300' : 'ring-gray-100'}`}
    >
      <div className="space-y-3 p-4">
        {/* Cabeçalho: número grande, cliente, prazo. É o que o entregador procura primeiro. */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              {canOpenOrder ? (
                <Link to={`/orders/${order.id}`} className="text-2xl font-extrabold leading-none text-gray-900 hover:underline">
                  {numberLabel}
                </Link>
              ) : (
                <span className="text-2xl font-extrabold leading-none text-gray-900">{numberLabel}</span>
              )}
              <span className="truncate text-base font-semibold text-gray-800">{customerName ?? DELIVERY_CARD_LABELS.noCustomer}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {deadline && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${DEADLINE_CLASSES[deadline.tone]}`}>
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {deadline.label}
                </span>
              )}
              {order.scheduledFor && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-800">
                  {DELIVERY_CARD_LABELS.scheduled(formatClock(order.scheduledFor))}
                </span>
              )}
              {group === 'kitchen' && isOrderStatus(order.status) && (
                <span className={`rounded-full px-2 py-0.5 font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
              )}
              {onRoute && (dispatchedSince || delivery.deliverer) && (
                <span className="text-gray-500">
                  {[dispatchedSince && DELIVERY_CARD_LABELS.dispatchedSince(dispatchedSince), delivery.deliverer && DELIVERY_CARD_LABELS.withCourier(delivery.deliverer.name)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
          </div>
          <span className="whitespace-nowrap text-lg font-bold text-gray-900">{formatBrl(order.totalAmount)}</span>
        </header>

        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="text-base leading-snug text-gray-900">{address}</p>
            {complement && <p className="font-semibold text-gray-800">{complement}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              {distance && (
                <span className="inline-flex items-center gap-1">
                  <Route className="h-3 w-3" aria-hidden="true" />
                  {distance}
                  {route?.source === 'straight_line' ? DELIVERY_CARD_LABELS.straightLine : ''}
                </span>
              )}
              {duration && <span>{DELIVERY_CARD_LABELS.byCar(duration)}</span>}
              <button
                type="button"
                onClick={() => setShowMap((current) => !current)}
                aria-expanded={showMap}
                className="inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-2 hover:underline"
              >
                <MapIcon className="h-3 w-3" aria-hidden="true" />
                {showMap ? DELIVERY_CARD_LABELS.hideMap : DELIVERY_CARD_LABELS.showMap}
              </button>
            </p>
          </div>
        </div>

        {showMap && (
          <iframe
            title={`Mapa: ${address}`}
            src={googleMapsEmbedUrl(address, destination)}
            className="block h-52 w-full rounded-xl border-0 bg-gray-100"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}

        {/* Ações de contato grandes, para o dedão: rota, ligar e mensagem. */}
        <div className={`grid gap-2 ${phone ? 'grid-cols-3' : 'grid-cols-1'}`}>
          <a
            href={googleMapsDirectionsUrl(address, destination)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${actionButton} bg-brand-600 text-white hover:bg-brand-700`}
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            {DELIVERY_CARD_LABELS.route}
          </a>
          {phone && (
            <a href={telUrl(phone)} className={`${actionButton} border border-gray-300 text-gray-800 hover:bg-gray-50`}>
              <Phone className="h-4 w-4" aria-hidden="true" />
              {DELIVERY_CARD_LABELS.call}
            </a>
          )}
          {phone &&
            (canChat ? (
              <Link to={buildConversationLink(phone)} className={`${actionButton} border border-gray-300 text-gray-800 hover:bg-gray-50`}>
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {DELIVERY_CARD_LABELS.chat}
              </Link>
            ) : (
              <a
                href={whatsappUrl(phone)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${actionButton} border border-gray-300 text-gray-800 hover:bg-gray-50`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {DELIVERY_CARD_LABELS.whatsapp}
              </a>
            ))}
        </div>

        {/* Pagamento: o que cobrar e o troco a levar, sem precisar fazer conta. */}
        {paidOnline ? (
          <p className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-sm font-semibold text-green-800">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {DELIVERY_CARD_LABELS.paidOnline}
          </p>
        ) : (
          <div className="rounded-xl bg-gray-50 px-3 py-2.5">
            {payments.length === 0 && <p className="text-sm text-gray-500">{DELIVERY_CARD_LABELS.noPayment}</p>}
            {payments.map((payment) => {
              const change = paymentChangeAmount(payment)
              return (
                <div key={payment.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-gray-900">
                      <Banknote className="h-4 w-4 text-gray-500" aria-hidden="true" />
                      {DELIVERY_CARD_LABELS.charge(formatBrl(payment.amount))}
                    </span>
                    <span className="text-right text-gray-700">
                      {paymentMethodLabel(payment.paymentTypeName)}
                      {payment.splitLabel ? ` · ${payment.splitLabel}` : ''}
                    </span>
                  </div>
                  {change !== undefined && (
                    // Troco em destaque: é o que o entregador precisa separar antes de sair.
                    <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                      <span className="text-xs text-amber-800">
                        {DELIVERY_CARD_LABELS.customerPays} <span className="whitespace-nowrap">{formatBrl(payment.changeFor ?? '0')}</span>
                      </span>
                      <span className="whitespace-nowrap text-sm font-bold text-amber-900">
                        {DELIVERY_CARD_LABELS.bringChange(formatBrl(change))}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {notes && (
          <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            <StickyNote className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="whitespace-pre-line">{notes}</span>
          </p>
        )}

        {/* Conferência da sacola antes de sair, no estilo da Cozinha. Fica só neste aparelho. */}
        <section>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setItemsOpen((current) => !current)}
              aria-expanded={itemsOpen}
              className="inline-flex min-h-9 items-center gap-1 text-xs text-gray-500"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${itemsOpen ? '' : '-rotate-90'}`} aria-hidden="true" />
              <span className="font-semibold text-gray-700">
                {onRoute ? DELIVERY_CARD_LABELS.itemsSummary(order.items.length) : DELIVERY_CARD_LABELS.checkTitle}
              </span>
              {' · '}
              <span className="font-semibold tabular-nums text-gray-800">
                {DELIVERY_CARD_LABELS.progress(checkedCount, order.items.length)}
              </span>
            </button>
            {itemsOpen &&
              (checkedCount < order.items.length ? (
                <button
                  type="button"
                  onClick={() => setChecked(new Set(order.items.map((_, index) => index)))}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 active:scale-95"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {DELIVERY_CARD_LABELS.markAll}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setChecked(new Set())}
                  className="text-xs font-medium text-gray-500 underline-offset-2 hover:underline"
                >
                  {DELIVERY_CARD_LABELS.clear}
                </button>
              ))}
          </div>
          {itemsOpen && (
          <progress
            value={checkedCount}
            max={Math.max(order.items.length, 1)}
            aria-label={DELIVERY_CARD_LABELS.progress(checkedCount, order.items.length)}
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-green-500 [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:bg-green-500 [&::-webkit-progress-value]:transition-all"
          />
          )}
          {itemsOpen && (
            <ul className="mt-1 divide-y divide-gray-100">
              {order.items.map((item, index) => {
                const isChecked = checked.has(index)
                return (
                  <li key={`${item.productName}-${index}`}>
                    <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleChecked(index)}
                        aria-label={DELIVERY_CARD_LABELS.markItem(item.productName)}
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
          )}
        </section>

        {!onRoute && couriers.length > 0 && (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
            {DELIVERY_CARD_LABELS.courier}
            <Select
              value={delivery.deliverer?.id ?? ''}
              disabled={busy}
              onChange={(value) => onAssign(value || null)}
              ariaLabel={DELIVERY_CARD_LABELS.courier}
              options={[
                { value: '', label: DELIVERY_CARD_LABELS.noCourier },
                ...couriers.map((courier) => ({ value: courier.id, label: courier.name })),
              ]}
            />
          </label>
        )}

        {group === 'kitchen' && (
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <CookingPot className="h-3.5 w-3.5" aria-hidden="true" />
            {DELIVERY_CARD_LABELS.stillCooking}
          </p>
        )}

        {delivery.status === 'pending' && (
          <Button
            variant={group === 'ready' ? 'primary' : 'secondary'}
            onClick={() => onUpdateStatus('dispatched')}
            loading={busy}
            className="min-h-12 w-full rounded-xl text-base font-bold"
          >
            <Navigation className="h-5 w-5" aria-hidden="true" />
            {DELIVERY_CARD_LABELS.dispatch}
          </Button>
        )}
        {delivery.status === 'dispatched' && (
          // "Não entregue" separado e discreto: antes ficava colado em "Entregue", do mesmo tamanho.
          <div className="flex items-center gap-3">
            <Button
              onClick={() => onUpdateStatus('delivered')}
              loading={busy}
              className="min-h-12 flex-1 rounded-xl text-base font-bold"
            >
              <CheckCheck className="h-5 w-5" aria-hidden="true" />
              {DELIVERY_CARD_LABELS.delivered}
            </Button>
            <button
              type="button"
              onClick={onFail}
              disabled={busy}
              className="px-2 py-3 text-sm font-medium text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {DELIVERY_CARD_LABELS.failed}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
