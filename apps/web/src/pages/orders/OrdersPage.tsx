import { FISCAL_STATUS_COLORS, FISCAL_STATUS_LABELS } from '@/constants/statusLabels'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_CHANNEL_LABELS,
  ORDER_TYPE_LABELS,
  type OrderStatus,
} from '@/constants/orderLabels'
import { Skeleton } from '@/components/ui/Skeleton'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, ChevronRight, X } from 'lucide-react'
import { paymentChangeText, paymentMethodLabel } from '@/constants/paymentLabels'
import { Pagination } from '@/components/ui/Pagination'
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, formatBRL, plural } from '@/lib/listing'
import { orderNumberLabel } from '@/lib/orderLabel'
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog'

type OrderTypeValue = 'table' | 'delivery' | 'pickup'
type OrderChannelValue = 'whatsapp' | 'ifood' | 'manual' | 'web'

const TYPE_OPTIONS: SelectOption<OrderTypeValue>[] = [
  { value: 'table', label: ORDER_TYPE_LABELS.table },
  { value: 'delivery', label: ORDER_TYPE_LABELS.delivery },
  { value: 'pickup', label: ORDER_TYPE_LABELS.pickup },
]

const CHANNEL_OPTIONS: SelectOption<OrderChannelValue>[] = [
  { value: 'whatsapp', label: ORDER_CHANNEL_LABELS.whatsapp ?? 'WhatsApp' },
  { value: 'ifood', label: ORDER_CHANNEL_LABELS.ifood ?? 'iFood' },
  { value: 'manual', label: ORDER_CHANNEL_LABELS.manual ?? 'Manual' },
  { value: 'web', label: ORDER_CHANNEL_LABELS.web ?? 'Cardápio online' },
]

function parseCsvParam<TValue extends string>(value: string | null): TValue[] {
  if (!value) return []
  return value.split(',').filter(Boolean) as TValue[]
}

interface Order {
  id: string
  number: number | null
  code: string | null
  table: { number: number } | null
  channel: string
  type: string
  status: OrderStatus
  totalAmount: string
  notes: string | null
  receivedAt: string
  customer: { name: string; phone: string } | null
  customerName?: string | null
  items: Array<{ productName: string; quantity: number }>
  payments: Array<{ paymentTypeName: string; amount: string; changeFor: string | null; splitLabel: string | null }>
  // Pagamento online pelo WhatsApp (Pix/link). `awaiting` ainda não foi para a cozinha.
  paymentStatus?: string
  // Resumo da nota fiscal, já vem na lista (null = sem nota).
  fiscalDocument?: FiscalDoc | null
}

// Ordenações oferecidas na lista. O valor vai para a URL como "campo:sentido".
const SORT_OPTIONS = [
  { value: 'receivedAt:desc', label: 'Mais recentes' },
  { value: 'receivedAt:asc', label: 'Mais antigos' },
  { value: 'totalAmount:desc', label: 'Maior valor' },
  { value: 'totalAmount:asc', label: 'Menor valor' },
] as const
type SortOptionValue = (typeof SORT_OPTIONS)[number]['value']

function formatOrderMoment(receivedAt: string): string {
  const date = new Date(receivedAt)
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  // Pedido de hoje mostra só a hora; de outro dia, a data junto (a lista "Todos" cruza dias).
  if (date.toDateString() === new Date().toDateString()) return time
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${time}`
}

const ONLINE_PAYMENT_BADGES: Record<string, { label: string; className: string }> = {
  awaiting: { label: 'Aguardando pagamento', className: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Pago online', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Pagamento expirou', className: 'bg-gray-200 text-gray-700' },
  partially_refunded: { label: 'Estorno parcial', className: 'bg-orange-100 text-orange-800' },
  refunded: { label: 'Estornado', className: 'bg-red-100 text-red-700' },
}

interface OrdersResponse {
  data: Order[]
  total: number
  page: number
  pageSize: number
  totalPages?: number
}

type FiscalDocStatus = 'pending' | 'emitting' | 'authorized' | 'rejected' | 'cancelled'

interface FiscalDoc {
  id: string
  orderId: string
  status: FiscalDocStatus
  chaveAcesso: string | null
  numeroDocumento: number | null
  errorCode: string | null
  errorMessage: string | null
  danfePdfUrl: string | null
}



const ACTIVE_STATUSES: OrderStatus[] = ['received', 'in_production', 'ready', 'in_delivery', 'picked_up']
const ALL_STATUSES: OrderStatus[] = [...ACTIVE_STATUSES, 'completed', 'cancelled']

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  received: 'in_production',
  in_production: 'ready',
  ready: 'completed',
  in_delivery: 'completed',
}

export function OrdersPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const statusFilter = searchParams.get('status') === 'all' ? 'all' : 'active'
  const typeFilter = parseCsvParam<OrderTypeValue>(searchParams.get('type'))
  const channelFilter = parseCsvParam<OrderChannelValue>(searchParams.get('channel'))
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo = searchParams.get('dateTo') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const pageSizeParam = parseInt(searchParams.get('pageSize') ?? '', 10)
  const pageSize = PAGE_SIZE_OPTIONS.some((option) => option === pageSizeParam) ? pageSizeParam : DEFAULT_PAGE_SIZE
  const sortParam = `${searchParams.get('sortBy') ?? 'receivedAt'}:${searchParams.get('sortDirection') ?? 'desc'}`
  const sortValue: SortOptionValue = SORT_OPTIONS.find((option) => option.value === sortParam)?.value ?? 'receivedAt:desc'
  const [sortBy, sortDirection] = sortValue.split(':') as [string, string]

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') ?? '')

  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [editingNotesText, setEditingNotesText] = useState('')
  const [emittingOrderId, setEmitiringOrderId] = useState<string | null>(null)
  const [fiscalError, setFiscalError] = useState<string | null>(null)

  const statuses = statusFilter === 'active' ? ACTIVE_STATUSES : ALL_STATUSES

  // Debounce da busca textual — evita disparar uma request a cada tecla digitada.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchInput), 400)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (debouncedSearch) next.set('search', debouncedSearch)
        else next.delete('search')
        next.delete('page')
        return next
      },
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  function updateFilters(updates: Record<string, string | null>) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      if (!('page' in updates)) next.delete('page')
      return next
    })
  }

  function clearFilters() {
    setSearchInput('')
    setDebouncedSearch('')
    setSearchParams({})
  }

  const hasActiveFilters =
    statusFilter === 'all' || typeFilter.length > 0 || channelFilter.length > 0 || !!dateFrom || !!dateTo || !!debouncedSearch

  const queryParams = new URLSearchParams()
  queryParams.set('status', statuses.join(','))
  if (typeFilter.length) queryParams.set('type', typeFilter.join(','))
  if (channelFilter.length) queryParams.set('channel', channelFilter.join(','))
  if (debouncedSearch) queryParams.set('search', debouncedSearch)
  if (dateFrom) queryParams.set('dateFrom', `${dateFrom}T00:00:00`)
  if (dateTo) queryParams.set('dateTo', `${dateTo}T23:59:59`)
  queryParams.set('page', String(page))
  queryParams.set('pageSize', String(pageSize))
  queryParams.set('sortBy', sortBy)
  queryParams.set('sortDirection', sortDirection)

  const { data, isLoading } = useQuery({
    queryKey: ['orders', queryParams.toString()],
    queryFn: () => api.get<OrdersResponse>(`/orders?${queryParams.toString()}`, accessToken ?? undefined),
    refetchInterval: 15_000,
  })

  // Listen to WebSocket events for both orders and fiscal
  useWebSocket((message) => {
    if (message.type.startsWith('order:')) {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
    if (message.type.startsWith('fiscal:')) {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      setEmitiringOrderId(null)
    }
  })

  const notesMutation = useMutation({
    mutationFn: ({ orderId, notes }: { orderId: string; notes: string | null }) =>
      api.patch(`/orders/${orderId}/notes`, { notes }, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      setEditingNotesId(null)
    },
  })

  async function handleEmitFiscal(orderId: string) {
    setEmitiringOrderId(orderId)
    setFiscalError(null)
    try {
      await api.post(`/orders/${orderId}/fiscal-document`, {}, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    } catch (e) {
      setFiscalError(e instanceof Error ? e.message : 'Erro ao emitir NF')
      setEmitiringOrderId(null)
    }
  }

  // Erro vira aviso (cache do react-query) e o botão trava até a resposta, sem clique duplo.
  const advanceMutation = useMutation({
    mutationFn: ({ orderId, nextStatus }: { orderId: string; nextStatus: OrderStatus }) =>
      api.patch(`/orders/${orderId}/status`, { status: nextStatus }, accessToken ?? undefined),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })
  const [cancelTarget, setCancelTarget] = useState<{ id: string; status: OrderStatus; label: string } | null>(null)

  function startEditingNotes(orderId: string, currentNotes: string | null) {
    setEditingNotesId(orderId)
    setEditingNotesText(currentNotes ?? '')
  }

  function saveNotes(orderId: string) {
    notesMutation.mutate({ orderId, notes: editingNotesText.trim() || null })
  }

  const orders = data?.data ?? []
  const total = data?.total ?? 0

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pedidos</h1>
          {data && <p className="text-sm text-gray-500">{plural(total, 'pedido', 'pedidos')}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate('/orders/new')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Novo pedido
          </button>
          <button
            onClick={() => updateFilters({ status: null })}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors active:scale-95 ${
              statusFilter === 'active' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Ativos{statusFilter === 'active' && data ? ` (${total})` : ''}
          </button>
          <button
            onClick={() => updateFilters({ status: 'all' })}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors active:scale-95 ${
              statusFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Todos (histórico)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Nº do pedido, nome ou telefone do cliente"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="w-40">
          <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
          <Select
            multiple
            options={TYPE_OPTIONS}
            value={typeFilter}
            onChange={(value) => updateFilters({ type: value.join(',') || null })}
            placeholder="Todos"
          />
        </div>
        <div className="w-40">
          <label className="block text-xs font-medium text-gray-500 mb-1">Canal</label>
          <Select
            multiple
            options={CHANNEL_OPTIONS}
            value={channelFilter}
            onChange={(value) => updateFilters({ channel: value.join(',') || null })}
            placeholder="Todos"
          />
        </div>
        <div className="w-40">
          <label className="block text-xs font-medium text-gray-500 mb-1">Ordenar por</label>
          <Select
            size="sm"
            value={sortValue}
            onChange={(value) => {
              const [field, direction] = value.split(':')
              updateFilters({
                sortBy: field === 'receivedAt' ? null : field ?? null,
                sortDirection: direction === 'desc' ? null : direction ?? null,
              })
            }}
            ariaLabel="Ordenar por"
            options={SORT_OPTIONS}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">De</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => updateFilters({ dateFrom: e.target.value || null })}
            className="text-sm border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Até</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => updateFilters({ dateTo: e.target.value || null })}
            className="text-sm border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
            Limpar filtros
          </button>
        )}
      </div>

      {fiscalError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {fiscalError}
          <button onClick={() => setFiscalError(null)} className="ml-2 text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-4 w-2/3 mb-2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {orders.map((order) => {
          const next = NEXT_STATUS[order.status]
          const fiscalDoc = order.fiscalDocument ?? null
          return (
            <div key={order.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-extrabold text-gray-900">{orderNumberLabel(order)}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ORDER_STATUS_COLORS[order.status]}`}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-xs text-gray-400 uppercase">
                    {ORDER_CHANNEL_LABELS[order.channel] ?? order.channel} · {ORDER_TYPE_LABELS[order.type as keyof typeof ORDER_TYPE_LABELS] ?? order.type}
                  </span>
                  {order.paymentStatus && ONLINE_PAYMENT_BADGES[order.paymentStatus] && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ONLINE_PAYMENT_BADGES[order.paymentStatus]?.className}`}>
                      {ONLINE_PAYMENT_BADGES[order.paymentStatus]?.label}
                    </span>
                  )}
                  {fiscalDoc && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${FISCAL_STATUS_COLORS[fiscalDoc.status]}`}>
                      NF: {FISCAL_STATUS_LABELS[fiscalDoc.status]}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">
                    {formatBRL(order.totalAmount)}
                  </span>
                  {/* Link só no cabeçalho: o card inteiro navegável engoliria os botões de ação. */}
                  <Link
                    to={`/orders/${order.id}`}
                    aria-label="Abrir detalhe do pedido"
                    className="inline-flex items-center text-gray-400 transition-colors hover:text-brand-600"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                </div>
              </div>

              {order.customer ? (
                <p className="text-sm text-gray-600 mb-1">
                  {order.customer.name} · {order.customer.phone}
                </p>
              ) : order.customerName ? (
                <p className="text-sm text-gray-600 mb-1">{order.customerName}</p>
              ) : null}

              <p className="text-xs text-gray-500 mb-2">
                {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
              </p>

              {order.payments.length > 0 && (
                <p className="text-xs text-gray-400 mb-2">
                  Pagamento:{' '}
                  {order.payments
                    .map((payment) =>
                      [paymentMethodLabel(payment.paymentTypeName), payment.splitLabel, paymentChangeText(payment)]
                        .filter(Boolean)
                        .join(' · ')
                    )
                    .join(' + ')}
                </p>
              )}

              {editingNotesId === order.id ? (
                <div className="mb-2">
                  <textarea
                    autoFocus
                    value={editingNotesText}
                    onChange={(e) => setEditingNotesText(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    className="w-full text-xs border border-brand-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                    placeholder="Observação do pedido..."
                  />
                  <div className="flex gap-1.5 mt-1">
                    <button
                      onClick={() => saveNotes(order.id)}
                      disabled={notesMutation.isPending}
                      className="px-2 py-0.5 text-xs bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50 transition-colors"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingNotesId(null)}
                      className="px-2 py-0.5 text-xs text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-1 mb-2 group">
                  {order.notes ? (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 flex-1 italic">
                      📝 {order.notes}
                    </p>
                  ) : null}
                  <button
                    onClick={() => startEditingNotes(order.id, order.notes)}
                    className={`text-xs text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ${order.notes ? '' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    {order.notes ? '✏️' : '+ nota'}
                  </button>
                </div>
              )}

              {/* Fiscal document info */}
              {fiscalDoc && fiscalDoc.status === 'authorized' && (
                <div className="mb-2 px-3 py-1.5 bg-green-50 rounded-lg text-xs">
                  {fiscalDoc.chaveAcesso && (
                    <p className="text-green-800 font-mono mb-1">
                      Chave: {fiscalDoc.chaveAcesso}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {fiscalDoc.danfePdfUrl && (
                      <a
                        href={fiscalDoc.danfePdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:text-brand-700 font-medium"
                      >
                        📄 DANFE PDF
                      </a>
                    )}
                    {fiscalDoc.numeroDocumento && (
                      <span className="text-gray-500">Nº {fiscalDoc.numeroDocumento}</span>
                    )}
                  </div>
                </div>
              )}

              {fiscalDoc && fiscalDoc.status === 'rejected' && (
                <div className="mb-2 px-3 py-1.5 bg-red-50 rounded-lg text-xs text-red-700">
                  Erro: {fiscalDoc.errorMessage || fiscalDoc.errorCode || 'Falha na emissão'}
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {formatOrderMoment(order.receivedAt)}
                </span>
                <div className="flex gap-2">
                  {/* Emitir NF button */}
                  {order.status === 'completed' && !fiscalDoc && (
                    <button
                      onClick={() => handleEmitFiscal(order.id)}
                      disabled={emittingOrderId === order.id}
                      className="px-2 py-1 text-xs text-green-700 border border-green-300 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
                    >
                      {emittingOrderId === order.id ? 'Emitindo...' : 'Emitir NF'}
                    </button>
                  )}
                  {order.status !== 'completed' && order.status !== 'cancelled' && (
                    <button
                      onClick={() => setCancelTarget({ id: order.id, status: order.status, label: orderNumberLabel(order) })}
                      className="mr-2 px-2 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                  {next && (
                    <button
                      onClick={() => advanceMutation.mutate({ orderId: order.id, nextStatus: next })}
                      disabled={advanceMutation.isPending && advanceMutation.variables?.orderId === order.id}
                      className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition-colors active:scale-95 disabled:opacity-50"
                    >
                      → {ORDER_STATUS_LABELS[next]}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {!isLoading && orders.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">
              {statusFilter === 'active' ? 'Nenhum pedido ativo' : 'Nenhum pedido encontrado'}
            </p>
            {/* Concluídos e cancelados só aparecem em "Todos": sem isso a lista vazia parece que perdeu o histórico. */}
            {statusFilter === 'active' && (
              <button
                onClick={() => updateFilters({ status: 'all' })}
                className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
              >
                Ver histórico (concluídos e cancelados)
              </button>
            )}
          </div>
        )}
      </div>

      {!isLoading && orders.length > 0 && (
        <Pagination
          variant="standalone"
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(nextPage) => updateFilters({ page: nextPage > 1 ? String(nextPage) : null })}
          onPageSizeChange={(nextSize) => updateFilters({ pageSize: nextSize === DEFAULT_PAGE_SIZE ? null : String(nextSize) })}
        />
      )}

      <CancelOrderDialog order={cancelTarget} onClose={() => setCancelTarget(null)} />
    </div>
  )
}
