import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { ChevronRight, RotateCcw, UserRound } from 'lucide-react'
import { formatBRL } from '@/lib/listing'
import { storefrontApi, type StorefrontAccount, type StorefrontAccountOrder, type StorefrontOrderStatus } from './storefrontApi'
import { currentStepIndex, isFinalStatus, orderStatusBadge, statusSteps, type OrderStatusTone } from './storefrontFormat'
import type { RecentOrder } from './storefrontStorage'
import { storefrontStorage } from './storefrontStorage'
import { BottomSheet } from './BottomSheet'
import { CARD, STOREFRONT_ACCENT } from './storefrontTheme'

const ACTIVE_POLL_MS = 15_000

/** Um pedido da lista, juntando o que veio da conta (WhatsApp e site) e o que foi feito neste aparelho. */
interface OrderEntry {
  orderId: string
  token: string
  number: number | null
  createdAt: string
  total: number | null
  type: string | null
  status: string | null
  paymentStatus: string | null
  itemsSummary: string | null
  accountOrder: StorefrontAccountOrder | null
}

function summarize(items: Array<{ name: string; quantity: number }>): string | null {
  if (items.length === 0) return null
  return items.map((item) => `${item.quantity}× ${item.name}`).join(', ')
}

function mergeOrders(accountOrders: StorefrontAccountOrder[], deviceOrders: RecentOrder[]): OrderEntry[] {
  const entries = new Map<string, OrderEntry>()
  for (const order of accountOrders) {
    entries.set(order.id, {
      orderId: order.id,
      token: order.trackingToken,
      number: order.number,
      createdAt: order.createdAt,
      total: order.total,
      type: order.type,
      status: order.status,
      paymentStatus: order.paymentStatus,
      itemsSummary: summarize(order.items),
      accountOrder: order,
    })
  }
  for (const order of deviceOrders) {
    if (entries.has(order.orderId)) continue
    entries.set(order.orderId, {
      orderId: order.orderId,
      token: order.token,
      number: order.number,
      createdAt: order.createdAt,
      total: null,
      type: null,
      status: null,
      paymentStatus: null,
      itemsSummary: null,
      accountOrder: null,
    })
  }
  return [...entries.values()].sort((first, second) => second.createdAt.localeCompare(first.createdAt))
}

/** Completa a linha com o status atual (pedido do aparelho ou ainda em andamento). */
function withLiveStatus(entry: OrderEntry, live: StorefrontOrderStatus | undefined): OrderEntry {
  if (!live) return entry
  return {
    ...entry,
    number: live.number ?? entry.number,
    total: live.total,
    type: live.type,
    status: live.status,
    paymentStatus: live.paymentStatus,
    itemsSummary: entry.itemsSummary ?? summarize(live.items),
  }
}

function needsLiveStatus(entry: OrderEntry): boolean {
  return entry.status === null || !isFinalStatus(entry.status)
}

function trackingPath(entry: { orderId: string; token: string }): string {
  return `/cardapio/pedido/${entry.orderId}?t=${encodeURIComponent(entry.token)}`
}

function orderDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

const TONE_CLASS: Record<OrderStatusTone, string> = {
  active: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
  payment: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  done: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  cancelled: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

function StatusChip({ label, tone }: { label: string; tone: OrderStatusTone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}>
      {tone === 'active' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" aria-hidden="true" />}
      {label}
    </span>
  )
}

/** Barrinha com os passos (recebido → em preparo → saiu/pronto → entregue/retirado). */
function StepBar({ type, status }: { type: string; status: string }) {
  const steps = statusSteps(type)
  const current = currentStepIndex(type, status)
  return (
    <div className="mt-2.5 flex gap-1" aria-hidden="true">
      {steps.map((step, index) => (
        <span
          key={step.key}
          className={`h-1.5 flex-1 rounded-full ${index <= current ? STOREFRONT_ACCENT : 'bg-[#f0e2cf]'} ${index === current ? 'animate-pulse' : ''}`}
        />
      ))}
    </div>
  )
}

function OrderRow({ entry, onRepeat }: { entry: OrderEntry; onRepeat: (order: StorefrontAccountOrder) => void }) {
  const badge = entry.status && entry.type ? orderStatusBadge(entry.type, entry.status, entry.paymentStatus) : null
  const active = badge?.tone === 'active' || badge?.tone === 'payment'
  const canRepeat = entry.accountOrder !== null && entry.accountOrder.items.length > 0 && entry.status !== 'cancelled'
  return (
    <li className={`p-4 ${CARD}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[#1c120d]">
            {entry.number ? `Pedido #${entry.number}` : 'Pedido'}
            <span className="ml-2 text-xs font-normal text-[#8a7466]">{orderDate(entry.createdAt)}</span>
          </p>
          {entry.itemsSummary && <p className="mt-0.5 line-clamp-2 text-sm text-[#6b574b]">{entry.itemsSummary}</p>}
        </div>
        {entry.total !== null && <span className="shrink-0 text-sm font-semibold tabular-nums text-[#1c120d]">{formatBRL(entry.total)}</span>}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {badge ? <StatusChip label={badge.label} tone={badge.tone} /> : <span className="h-5 w-24 animate-pulse rounded-full bg-[#f0e2cf]" />}
      </div>
      {badge?.tone === 'active' && entry.type && entry.status && <StepBar type={entry.type} status={entry.status} />}

      <div className="mt-3 flex gap-2">
        <Link
          to={trackingPath(entry)}
          className={`flex h-10 flex-1 items-center justify-center gap-1 rounded-xl text-sm font-bold ${
            active ? `${STOREFRONT_ACCENT} text-white` : 'bg-white text-brand-700 ring-1 ring-[#f0e2cf]'
          }`}
        >
          {active ? 'Acompanhar' : 'Ver detalhes'} <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {canRepeat && entry.accountOrder && (
          <button
            type="button"
            onClick={() => entry.accountOrder && onRepeat(entry.accountOrder)}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-50 px-3 text-sm font-bold text-brand-700"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Repetir
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * Meus pedidos: os pedidos da conta (quem entrou com o WhatsApp vê também os do bot) e os feitos neste
 * aparelho, com o status de agora. Os que estão andando se atualizam sozinhos.
 */
export function MyOrdersSheet({
  establishmentId,
  account,
  onClose,
  onRepeat,
  onSignIn,
}: {
  establishmentId: string
  account: StorefrontAccount | null
  onClose: () => void
  onRepeat: (order: StorefrontAccountOrder) => void
  onSignIn: () => void
}) {
  const deviceOrders = useMemo(() => storefrontStorage.loadOrderHistory(establishmentId), [establishmentId])
  const entries = useMemo(() => mergeOrders(account?.recentOrders ?? [], deviceOrders), [account, deviceOrders])
  const live = useQueries({
    queries: entries.map((entry) => ({
      queryKey: ['storefront-order', entry.orderId, entry.token],
      queryFn: () => storefrontApi.orderStatus(entry.orderId, entry.token),
      enabled: needsLiveStatus(entry),
      retry: false,
      staleTime: 5_000,
      refetchInterval: (query: { state: { data?: StorefrontOrderStatus } }) =>
        query.state.data && isFinalStatus(query.state.data.status) ? false : ACTIVE_POLL_MS,
    })),
  })
  const rows = entries.map((entry, index) => withLiveStatus(entry, live[index]?.data))
  // Pedido do aparelho que a API não acha mais (link inválido) some da lista.
  const visible = rows.filter((row, index) => !(row.status === null && live[index]?.isError))
  const inProgress = visible.filter((row) => row.status === null || !isFinalStatus(row.status))
  const previous = visible.filter((row) => row.status !== null && isFinalStatus(row.status))

  return (
    <BottomSheet title="Meus pedidos" onClose={onClose}>
      <div className="space-y-5 px-4 pb-6 pt-4">
        {visible.length === 0 && (
          <div className={`px-5 py-8 text-center ${CARD}`}>
            <p className="font-semibold text-[#1c120d]">Você ainda não fez pedidos por aqui.</p>
            <p className="mt-1 text-sm text-[#6b574b]">Quando pedir, o andamento aparece nesta tela.</p>
          </div>
        )}

        {inProgress.length > 0 && (
          <section>
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-[#6b574b]">Em andamento</h3>
            <ul className="space-y-3">
              {inProgress.map((entry) => (
                <OrderRow key={entry.orderId} entry={entry} onRepeat={onRepeat} />
              ))}
            </ul>
          </section>
        )}

        {previous.length > 0 && (
          <section>
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-[#6b574b]">Anteriores</h3>
            <ul className="space-y-3">
              {previous.map((entry) => (
                <OrderRow key={entry.orderId} entry={entry} onRepeat={onRepeat} />
              ))}
            </ul>
          </section>
        )}

        {!account && (
          <button
            type="button"
            onClick={onSignIn}
            className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${CARD}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#1c120d]">Entre com seu WhatsApp</span>
              <span className="block text-xs text-[#6b574b]">Para ver também os pedidos feitos pelo WhatsApp e em outro aparelho.</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
          </button>
        )}
      </div>
    </BottomSheet>
  )
}

/** Cartão no topo do cardápio com o último pedido feito aqui e o status de agora. */
export function LatestOrderCard({ order, onOpenOrders }: { order: RecentOrder; onOpenOrders: () => void }) {
  const { data } = useQuery({
    queryKey: ['storefront-order', order.orderId, order.token],
    queryFn: () => storefrontApi.orderStatus(order.orderId, order.token),
    retry: false,
    staleTime: 5_000,
    refetchInterval: (query) => (query.state.data && isFinalStatus(query.state.data.status) ? false : ACTIVE_POLL_MS),
  })
  const badge = data ? orderStatusBadge(data.type, data.status, data.paymentStatus) : null
  const label = `Pedido${order.number ? ` #${order.number}` : ''}`
  const finished = badge?.tone === 'done' || badge?.tone === 'cancelled'

  if (finished) {
    return (
      <button type="button" onClick={onOpenOrders} className={`mt-5 flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm ${CARD}`}>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium text-gray-800">Último {label.toLowerCase()}</span>
          {badge && <StatusChip label={badge.label} tone={badge.tone} />}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 font-semibold text-brand-700">
          Meus pedidos <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    )
  }
  return (
    <Link to={trackingPath(order)} className={`mt-5 block px-4 py-3 text-sm ${CARD}`}>
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium text-gray-800">Acompanhar {label.toLowerCase()}</span>
          {badge && <StatusChip label={badge.label} tone={badge.tone} />}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
      </span>
      {badge?.tone === 'active' && data && <StepBar type={data.type} status={data.status} />}
    </Link>
  )
}
