import { toast } from '@/stores/toastStore'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Flame, HelpCircle, Timer } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { ORDER_CHANNEL_LABELS, ORDER_TYPE_LABELS } from '@/constants/orderLabels'
import {
  KITCHEN_DEADLINE_SOURCE_LABELS,
  KITCHEN_PRIORITY_MESSAGES,
  KITCHEN_URGENCY_BORDER,
  KITCHEN_URGENCY_CHIP,
  KITCHEN_URGENCY_LABELS,
  KITCHEN_URGENCY_TEXT,
  type KitchenDeadlineSource,
  type KitchenUrgency,
} from '@/constants/kitchenPriority'
import { orderNumberLabel, orderPartyLabel } from '@/lib/orderLabel'

interface OrderItem {
  id: string
  productName: string
  quantity: number
  notes: string | null
  readyAt: string | null
}

interface KitchenOrder {
  id: string
  number: number | null
  code: string | null
  table: { number: number } | null
  customer: { name: string | null } | null
  type: string
  channel: string
  status: 'received' | 'in_production'
  totalAmount: string
  notes: string | null
  receivedAt: string
  scheduledFor: string | null
  ageMinutes: number
  slaStatus: 'ok' | 'warning' | 'critical'
  waitingSince: string
  priority: {
    preparationMinutes: number
    routeMinutes: number
    deadlineSource: KitchenDeadlineSource
    readyBy: string
    startBy: string
    slackMinutes: number
    urgency: KitchenUrgency
    position: number | null
    doNow: boolean
  }
  items: OrderItem[]
}

const formatClock = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Relógio da tela: atualiza a cada 15 s para o cronômetro e a folga andarem entre uma busca e outra. */
function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

// A urgência acompanha o relógio da tela, com os mesmos limites da API (5 e 15 min).
function liveUrgency(startBy: string, now: number): { slack: number; urgency: KitchenUrgency } {
  const slack = Math.floor((new Date(startBy).getTime() - now) / 60_000)
  const urgency: KitchenUrgency = slack < 0 ? 'late' : slack <= 5 ? 'now' : slack <= 15 ? 'soon' : 'ok'
  return { slack, urgency }
}

function formatWaiting(since: string, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${minutes} min`
}

type OrderCardProps = {
  order: KitchenOrder
  now: number
  onAdvance: (orderId: string, status: string) => void
  onItemReady: (orderId: string, itemId: string) => void
  /** Ids (pedido ou item) com uma ação em andamento: o botão trava até a resposta, sem clique duplo. */
  busyIds: ReadonlySet<string>
}

function OrderCard({ order, now, onAdvance, onItemReady, busyIds }: OrderCardProps) {
  const nextStatus = order.status === 'received' ? 'in_production' : 'ready'
  const nextLabel = order.status === 'received' ? 'Iniciar' : 'Tudo pronto'
  const { priority } = order
  const { slack, urgency } = liveUrgency(priority.startBy, now)
  const doNow = priority.doNow || (order.status === 'received' && (urgency === 'late' || urgency === 'now'))

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${KITCHEN_URGENCY_BORDER[urgency]} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          {priority.position !== null && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-900 px-1.5 text-xs font-bold text-white">
              {priority.position}º
            </span>
          )}
          <span className="text-base font-extrabold normal-case tracking-normal text-gray-900">{orderNumberLabel(order)}</span>
          {ORDER_CHANNEL_LABELS[order.channel] ?? order.channel} ·{' '}
          {ORDER_TYPE_LABELS[order.type as keyof typeof ORDER_TYPE_LABELS] ?? order.type}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${KITCHEN_URGENCY_TEXT[urgency]}`}
          title={KITCHEN_PRIORITY_MESSAGES.waiting}
        >
          <Timer aria-hidden="true" className="h-4 w-4" />
          {formatWaiting(order.waitingSince, now)} {KITCHEN_PRIORITY_MESSAGES.waiting}
        </span>
      </div>

      {orderPartyLabel(order) && (
        <p className="-mt-1 text-lg font-bold text-gray-900">{orderPartyLabel(order)}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {doNow && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 font-bold uppercase tracking-wide text-white">
            <Flame aria-hidden="true" className="h-3.5 w-3.5" />
            {KITCHEN_PRIORITY_MESSAGES.doNow}
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 font-semibold ${KITCHEN_URGENCY_CHIP[urgency]}`}>
          {KITCHEN_URGENCY_LABELS[urgency]}
          {' · '}
          {slack >= 0
            ? KITCHEN_PRIORITY_MESSAGES.slackAhead(slack)
            : order.status === 'in_production'
              ? KITCHEN_PRIORITY_MESSAGES.slackLateInProduction(-slack)
              : KITCHEN_PRIORITY_MESSAGES.slackLate(-slack)}
        </span>
      </div>

      <p className="text-xs text-gray-600">
        {order.status === 'received' && (
          <>
            {KITCHEN_PRIORITY_MESSAGES.startBy} <strong>{formatClock(priority.startBy)}</strong> ·{' '}
          </>
        )}
        {KITCHEN_PRIORITY_MESSAGES.readyBy} <strong>{formatClock(priority.readyBy)}</strong>
        <span className="text-gray-400">
          {' '}
          ({KITCHEN_DEADLINE_SOURCE_LABELS[priority.deadlineSource]} · {KITCHEN_PRIORITY_MESSAGES.preparation(priority.preparationMinutes)}
          {priority.routeMinutes > 0 && <> · {KITCHEN_PRIORITY_MESSAGES.route(priority.routeMinutes)}</>})
        </span>
      </p>

      {order.scheduledFor && (
        <p className="text-xs font-semibold text-brand-600">
          Encomenda para {new Date(order.scheduledFor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <ul className="space-y-1">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 text-sm text-gray-800">
            <span className={item.readyAt ? 'line-through text-gray-400' : undefined}>
              <span className="font-bold text-lg mr-2">{item.quantity}×</span>
              {item.productName}
              {item.notes && <span className="text-gray-500 ml-1">({item.notes})</span>}
            </span>
            {item.readyAt ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-xs text-green-600">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                Pronto
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onItemReady(order.id, item.id)}
                disabled={busyIds.has(item.id)}
                className="shrink-0 disabled:opacity-50 inline-flex items-center gap-1 rounded-md border border-green-600 px-2 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 active:scale-95"
              >
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                Pronto
              </button>
            )}
          </li>
        ))}
      </ul>

      {order.notes && <p className="text-xs text-gray-500 italic">{order.notes}</p>}

      <button
        onClick={() => onAdvance(order.id, nextStatus)}
        disabled={busyIds.has(order.id)}
        // Texto escuro no amarelo: branco no amarelo ficava ilegível de longe (contraste 1,9:1).
        className={`w-full py-2.5 md:py-3 px-3 text-base font-semibold rounded-lg transition-colors active:scale-95 disabled:opacity-60 ${
          nextStatus === 'in_production' ? 'bg-amber-400 text-gray-900 hover:bg-amber-500' : 'bg-green-700 text-white hover:bg-green-800'
        }`}
      >
        {busyIds.has(order.id) ? 'Enviando…' : nextLabel}
      </button>
    </div>
  )
}

function PriorityExplanation() {
  return (
    <details className="mb-4 rounded-xl bg-white p-3 text-sm text-gray-700 shadow-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-gray-900">
        <HelpCircle aria-hidden="true" className="h-4 w-4" />
        {KITCHEN_PRIORITY_MESSAGES.howTitle}
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {KITCHEN_PRIORITY_MESSAGES.howBody.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  )
}

export function KitchenPage() {
  const now = useNow()
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['kitchen', 'queue'],
    queryFn: () => api.get<KitchenOrder[]>('/kitchen/queue', accessToken ?? undefined),
    refetchInterval: 15_000,
  })

  useWebSocket((message) => {
    if (
      message.type === 'order:created' ||
      message.type === 'order:status_changed' ||
      message.type === 'kitchen:order_queued'
    ) {
      void queryClient.invalidateQueries({ queryKey: ['kitchen', 'queue'] })
    }
  })

  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())

  // Erro vira aviso na tela (ex.: "Iniciar" sem estoque antes só não fazia nada).
  async function runAction(busyId: string, action: () => Promise<unknown>) {
    if (busyIds.has(busyId)) return
    setBusyIds((current) => new Set(current).add(busyId))
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não deu certo. Tente de novo.')
    } finally {
      setBusyIds((current) => {
        const next = new Set(current)
        next.delete(busyId)
        return next
      })
      void queryClient.invalidateQueries({ queryKey: ['kitchen', 'queue'] })
    }
  }

  function handleAdvance(orderId: string, status: string) {
    void runAction(orderId, () => api.patch(`/kitchen/orders/${orderId}/advance`, { status }, accessToken ?? undefined))
  }

  // Marcar item a item é o que dá ao relatório de tempo de preparo uma medição
  // por produto: sem isso a bebida herda a duração do prato que saiu junto.
  function handleItemReady(orderId: string, itemId: string) {
    void runAction(itemId, () => api.patch(`/kitchen/orders/${orderId}/items/${itemId}/ready`, {}, accessToken ?? undefined))
  }

  if (isLoading) return <div className="p-4 md:p-8 text-gray-500">Carregando fila...</div>

  const received = orders.filter((o) => o.status === 'received')
  const inProduction = orders.filter((o) => o.status === 'in_production')

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Cozinha</h1>
        <span className="bg-gray-900 text-white text-sm px-3 py-1 rounded-full">
          {orders.length} pedido{orders.length !== 1 ? 's' : ''}
        </span>
      </div>

      <PriorityExplanation />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">
            {KITCHEN_PRIORITY_MESSAGES.waitingColumn} ({received.length})
          </h2>
          <div className="space-y-3">
            {received.map((order) => (
              <OrderCard key={order.id} order={order} now={now} onAdvance={handleAdvance} onItemReady={handleItemReady} busyIds={busyIds} />
            ))}
            {received.length === 0 && (
              <p className="text-gray-400 text-center py-8">Nenhum pedido aguardando</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">
            Em preparo ({inProduction.length})
          </h2>
          <div className="space-y-3">
            {inProduction.map((order) => (
              <OrderCard key={order.id} order={order} now={now} onAdvance={handleAdvance} onItemReady={handleItemReady} busyIds={busyIds} />
            ))}
            {inProduction.length === 0 && (
              <p className="text-gray-400 text-center py-8">Nenhum pedido em preparo</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
