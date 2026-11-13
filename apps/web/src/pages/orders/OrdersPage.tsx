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

type OrderTypeValue = 'table' | 'delivery' | 'pickup'
type OrderChannelValue = 'whatsapp' | 'ifood' | 'manual'

const TYPE_OPTIONS: SelectOption<OrderTypeValue>[] = [
  { value: 'table', label: ORDER_TYPE_LABELS.table },
  { value: 'delivery', label: ORDER_TYPE_LABELS.delivery },
  { value: 'pickup', label: ORDER_TYPE_LABELS.pickup },
]

const CHANNEL_OPTIONS: SelectOption<OrderChannelValue>[] = [
  { value: 'whatsapp', label: ORDER_CHANNEL_LABELS.whatsapp ?? 'WhatsApp' },
  { value: 'ifood', label: ORDER_CHANNEL_LABELS.ifood ?? 'iFood' },
  { value: 'manual', label: ORDER_CHANNEL_LABELS.manual ?? 'Manual' },
]

function parseCsvParam<TValue extends string>(value: string | null): TValue[] {
  if (!value) return []
  return value.split(',').filter(Boolean) as TValue[]
}

interface Order {
  id: string
  channel: string
  type: string
  status: OrderStatus
  totalAmount: string
  notes: string | null
  receivedAt: string
  customer: { name: string; phone: string } | null
  items: Array<{ productName: string; quantity: number }>
  payments: Array<{ paymentTypeName: string; amount: string; changeFor: string | null; splitLabel: string | null }>
  // Pagamento online pelo WhatsApp (Pix/link). `awaiting` ainda não foi para a cozinha.
  paymentStatus?: string
}

const ONLINE_PAYMENT_BADGES: Record<string, { label: string; className: string }> = {
  awaiting: { label: 'Aguardando pagamento', className: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Pago online', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Pagamento expirou', className: 'bg-gray-200 text-gray-700' },
  refunded: { label: 'Estornado', className: 'bg-red-100 text-red-700' },
}

interface OrdersResponse {
  data: Order[]
  total: number
  page: number
  pageSize: number
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

const FISCAL_STATUS_LABELS: Record<FiscalDocStatus, string> = {
  pending: 'Pendente',
  emitting: 'Emitindo...',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
}

const FISCAL_STATUS_COLORS: Record<FiscalDocStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  emitting: 'bg-blue-100 text-blue-800',
  authorized: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-orange-100 text-orange-700',
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
  queryParams.set('pageSize', '20')

  const { data, isLoading } = useQuery({
    queryKey: ['orders', queryParams.toString()],
    queryFn: () => api.get<OrdersResponse>(`/orders?${queryParams.toString()}`, accessToken ?? undefined),
    refetchInterval: 15_000,
  })

  // Fetch fiscal documents for current orders
  const { data: fiscalDocs } = useQuery({
    queryKey: ['fiscal-docs', (data?.data ?? []).map((o) => o.id).join(',')],
    queryFn: async () => {
      const orders = data?.data ?? []
      if (orders.length === 0) return {} as Record<string, FiscalDoc>
      const results: Record<string, FiscalDoc> = {}
      await Promise.all(
        orders.map(async (order) => {
          try {
            const doc = await api.get<FiscalDoc>(
              `/orders/${order.id}/fiscal-document`,
              accessToken ?? undefined
            )
            results[order.id] = doc
          } catch {
            // No fiscal document for this order
          }
        })
      )
      return results
    },
    enabled: (data?.data ?? []).length > 0,
  })

  // Listen to WebSocket events for both orders and fiscal
  useWebSocket((message) => {
    if (message.type.startsWith('order:')) {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
    if (message.type.startsWith('fiscal:')) {
      void queryClient.invalidateQueries({ queryKey: ['fiscal-docs'] })
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
      void queryClient.invalidateQueries({ queryKey: ['fiscal-docs'] })
    } catch (e) {
      setFiscalError(e instanceof Error ? e.message : 'Erro ao emitir NF')
      setEmitiringOrderId(null)
    }
  }

  async function handleAdvance(orderId: string, nextStatus: OrderStatus) {
    await api.patch(`/orders/${orderId}/status`, { status: nextStatus }, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  async function handleCancel(orderId: string) {
    await api.patch(`/orders/${orderId}/status`, { status: 'cancelled', cancellationReason: 'Cancelado manualmente' }, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  function startEditingNotes(orderId: string, currentNotes: string | null) {
    setEditingNotesId(orderId)
    setEditingNotesText(currentNotes ?? '')
  }

  function saveNotes(orderId: string) {
    notesMutation.mutate({ orderId, notes: editingNotesText.trim() || null })
  }

  const orders = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Pedidos</h1>
        <div className="flex gap-2">
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
            Ativos ({statusFilter === 'active' ? total : ''})
          </button>
          <button
            onClick={() => updateFilters({ status: 'all' })}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors active:scale-95 ${
              statusFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Todos
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
          const fiscalDoc = fiscalDocs?.[order.id]
          return (
            <div key={order.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex flex-wrap items-center gap-2">
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
                    R$ {parseFloat(order.totalAmount).toFixed(2)}
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

              {order.customer && (
                <p className="text-sm text-gray-600 mb-1">
                  {order.customer.name} · {order.customer.phone}
                </p>
              )}

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
                  {new Date(order.receivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                      onClick={() => handleCancel(order.id)}
                      className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                  {next && (
                    <button
                      onClick={() => handleAdvance(order.id, next)}
                      className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
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
          <p className="text-gray-400 text-center py-12">
            {statusFilter === 'active' ? 'Nenhum pedido ativo' : 'Nenhum pedido encontrado'}
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <button
            onClick={() => updateFilters({ page: String(Math.max(1, page - 1)) })}
            disabled={page === 1}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors active:scale-95"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">{page} / {totalPages}</span>
          <button
            onClick={() => updateFilters({ page: String(Math.min(totalPages, page + 1)) })}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors active:scale-95"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}
