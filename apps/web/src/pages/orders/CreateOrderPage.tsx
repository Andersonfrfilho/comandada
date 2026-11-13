import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useAuthStore } from '@/stores/authStore'
import { api, ApiError } from '@/lib/api'
import { ORDER_TYPE_LABELS, type OrderType } from '@/constants/orderLabels'
import type { SelectOption } from '@/components/ui/Select'
import { ScheduleStep } from './ScheduleStep'
import { DeliveryStep, type SavedAddress } from './DeliveryStep'
import { PaymentStep, type PaymentLeg } from './PaymentStep'

interface Product {
  id: string
  name: string
  description: string | null
  price: string
  catalogId: string | null
}

interface Catalog {
  id: string
  name: string
  products: Product[]
}

interface Menu {
  catalogs: Catalog[]
  withoutCatalog: Product[]
}

interface TableComanda {
  id: string
  code: string
  customerName: string | null
}

interface TableWithComanda {
  id: string
  number: number
  capacity: number
  status: 'available' | 'occupied' | 'reserved'
  comanda: TableComanda | null
}

interface CartItem {
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  notes: string
}

interface PaymentTypeRow {
  id: number
  name: string
  type: string
  label: string
}

interface CreatedOrder {
  id: string
}

interface OrderDeliveryDetail {
  feeAmount: string
  distanceKm: string | null
}

interface OrderWithDelivery {
  id: string
  delivery: OrderDeliveryDetail[]
}

type Step = 'type' | 'menu' | 'schedule' | 'delivery' | 'payment' | 'confirm'

const STEP_TITLES: Record<Step, string> = {
  type: 'Tipo de pedido',
  menu: 'Montar pedido',
  schedule: 'Agendamento',
  delivery: 'Entrega',
  payment: 'Pagamento',
  confirm: 'Confirmar pedido',
}

function formatBRL(value: number | string) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CreateOrderPage() {
  const navigate = useNavigate()
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [step, setStep] = useState<Step>('type')
  const [orderType, setOrderType] = useState<OrderType>('table')
  const [selectedTable, setSelectedTable] = useState<TableWithComanda | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [globalNotes, setGlobalNotes] = useState('')
  const [requiresFiscal, setRequiresFiscal] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string | null>(null)

  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryComplement, setDeliveryComplement] = useState('')
  const [payments, setPayments] = useState<PaymentLeg[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerDocument, setCustomerDocument] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [createdDelivery, setCreatedDelivery] = useState<OrderDeliveryDetail | null>(null)

  const { data: menu } = useQuery({
    queryKey: ['menu'],
    queryFn: () => api.get<Menu>('/menu', accessToken ?? undefined),
  })

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get<TableWithComanda[]>('/tables', accessToken ?? undefined),
    enabled: orderType === 'table',
  })

  const { data: paymentTypes = [] } = useQuery({
    queryKey: ['payment-types'],
    queryFn: () => api.get<PaymentTypeRow[]>('/payment-types', accessToken ?? undefined),
  })

  const { data: savedAddresses = [] } = useQuery({
    queryKey: ['customer-addresses', customerId],
    queryFn: () => api.get<SavedAddress[]>(`/customers/${customerId}/addresses`, accessToken ?? undefined),
    enabled: !!customerId,
  })

  const paymentTypeOptions: SelectOption<string>[] = paymentTypes.map((pt) => ({
    value: pt.name,
    label: pt.label,
  }))

  const openComandaMutation = useMutation({
    mutationFn: (tableId: string) =>
      api.post<TableComanda>(`/tables/${tableId}/comanda`, {}, accessToken ?? undefined),
    onSuccess: (comanda) => {
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      setSelectedTable((prev) => (prev ? { ...prev, comanda } : prev))
    },
  })

  const mutation = useMutation({
    mutationFn: (body: unknown) => api.post<CreatedOrder>('/orders', body, accessToken ?? undefined),
    onSuccess: async (order) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      if (orderType === 'delivery') {
        const fullOrder = await api.get<OrderWithDelivery>(`/orders/${order.id}`, accessToken ?? undefined)
        const delivery = fullOrder.delivery?.[0]
        if (delivery) {
          setCreatedDelivery(delivery)
          return
        }
      }
      navigate('/orders')
    },
  })

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        unitPrice: Number(product.price),
        quantity: 1,
        notes: '',
      }]
    })
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId))
    } else {
      setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: qty } : i))
    }
  }

  function updateItemNotes(productId: string, notes: string) {
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, notes } : i))
  }

  const total = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const paymentsSum = payments.reduce((s, leg) => s + (Number(leg.amount) || 0), 0)
  const paymentsBalanced = Math.abs(paymentsSum - total) < 0.01
  const paymentsValid =
    payments.length > 0 &&
    payments.every((leg) => leg.paymentTypeName.length > 0 && Number(leg.amount) > 0) &&
    paymentsBalanced
  const fiscalBlocked = requiresFiscal && customerDocument.trim().length === 0

  const allCatalogs = menu?.catalogs ?? []
  const filteredCatalogs = search
    ? allCatalogs.map((c) => ({
        ...c,
        products: c.products.filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((c) => c.products.length > 0)
    : activeCat
    ? allCatalogs.filter((c) => c.id === activeCat)
    : allCatalogs

  const steps: Step[] = orderType === 'delivery'
    ? ['type', 'menu', 'schedule', 'delivery', 'payment', 'confirm']
    : ['type', 'menu', 'schedule', 'payment', 'confirm']

  function goNext() {
    const idx = steps.indexOf(step)
    const next = steps[idx + 1]
    if (!next) return
    if (next === 'payment' && payments.length === 0) {
      setPayments([{ id: crypto.randomUUID(), paymentTypeName: '', amount: total.toFixed(2), changeFor: '', splitLabel: '' }])
    }
    setStep(next)
  }

  function goBack() {
    const idx = steps.indexOf(step)
    const prev = steps[idx - 1]
    if (prev) setStep(prev)
  }

  function handleSubmit() {
    const notes = globalNotes || undefined

    const body = {
      channel: 'manual' as const,
      type: orderType,
      tableId: selectedTable?.id,
      items: cart.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        ...(i.notes ? { notes: i.notes } : {}),
      })),
      payments: payments.map((leg) => ({
        paymentTypeName: leg.paymentTypeName,
        amount: Number(leg.amount),
        ...(leg.changeFor ? { changeFor: Number(leg.changeFor) } : {}),
        ...(payments.length > 1 && leg.splitLabel ? { splitLabel: leg.splitLabel } : {}),
      })),
      fiscalEnabled: requiresFiscal,
      ...(notes ? { notes } : {}),
      ...(isScheduled && scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      ...(customerName ? { customerName } : {}),
      ...(customerDocument ? { customerDocument } : {}),
      ...(customerId ? { customerId } : {}),
      ...(orderType === 'delivery'
        ? { delivery: { address: deliveryAddress, ...(deliveryComplement ? { complement: deliveryComplement } : {}) } }
        : {}),
    }
    mutation.mutate(body)
  }

  async function lookupCustomer() {
    const clean = customerPhone.replace(/\D/g, '')
    if (clean.length < 10) return
    try {
      const result = await api.get<{ data: Array<{ id: string; name: string }> }>(
        `/customers?search=${clean}&pageSize=1`,
        accessToken ?? undefined
      )
      const match = result.data[0]
      if (match) {
        setCustomerId(match.id)
        setCustomerName(match.name)
      }
    } catch {
      // ignore lookup errors
    }
  }

  if (createdDelivery) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Pedido criado com sucesso</h2>
        <div className="bg-gray-50 rounded-xl px-5 py-4 mb-6">
          <p className="text-sm text-gray-600">Taxa de entrega calculada</p>
          <p className="text-xl font-bold text-brand-600">{formatBRL(createdDelivery.feeAmount)}</p>
          {createdDelivery.distanceKm && (
            <p className="text-xs text-gray-400 mt-1">{Number(createdDelivery.distanceKm).toFixed(1)} km</p>
          )}
        </div>
        <button
          onClick={() => navigate('/orders')}
          className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
        >
          Ir para pedidos
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-white md:bg-gray-50">
      <div className="flex flex-col flex-1 md:max-w-4xl md:mx-auto md:my-6 md:rounded-2xl md:shadow-sm bg-white md:border md:border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step !== 'type' && (
              <button onClick={goBack} className="text-gray-400 hover:text-gray-700 transition-colors">
                ←
              </button>
            )}
            <h2 className="font-semibold text-gray-900">{STEP_TITLES[step]}</h2>
          </div>
          <button onClick={() => navigate('/orders')} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Step: tipo */}
        {step === 'type' && (
          <div className="p-6">
            <div className="grid grid-cols-3 gap-3 mb-6">
              {(['table', 'delivery', 'pickup'] as OrderType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setOrderType(t); if (t !== 'table') setSelectedTable(null) }}
                  className={`p-4 rounded-xl border-2 text-sm font-medium transition-all ${
                    orderType === t
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">
                    {t === 'table' ? '🪑' : t === 'delivery' ? '🛵' : '🏃'}
                  </div>
                  {ORDER_TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {orderType === 'table' && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Selecionar mesa</p>
                {tables.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhuma mesa cadastrada</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {tables.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTable(t === selectedTable ? null : t)}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          selectedTable?.id === t.id
                            ? 'border-brand-500 bg-brand-50'
                            : t.status === 'occupied'
                            ? 'border-red-200 bg-red-50 opacity-60'
                            : 'border-gray-200 hover:border-brand-300'
                        }`}
                      >
                        <p className="text-lg font-bold text-gray-900">{t.number}</p>
                        <p className="text-xs text-gray-500">{t.capacity}p</p>
                        {t.comanda && (
                          <p className="text-xs font-mono text-brand-600">{t.comanda.code}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedTable && !selectedTable.comanda && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm text-amber-800">
                      Mesa {selectedTable.number} não possui comanda aberta.
                    </p>
                    <button
                      onClick={() => openComandaMutation.mutate(selectedTable.id)}
                      disabled={openComandaMutation.isPending}
                      className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-amber-700 transition-colors active:scale-95 flex-shrink-0"
                    >
                      {openComandaMutation.isPending ? 'Abrindo...' : 'Abrir comanda'}
                    </button>
                  </div>
                )}
                {openComandaMutation.isError && (
                  <p className="mt-2 text-sm text-red-600">
                    {openComandaMutation.error instanceof Error
                      ? openComandaMutation.error.message
                      : 'Erro ao abrir comanda'}
                  </p>
                )}
                {selectedTable?.comanda && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                    <QRCodeSVG
                      value={`${window.location.origin}/comanda/${selectedTable.comanda.code}`}
                      size={64}
                      level="M"
                    />
                    <div>
                      <p className="text-sm text-green-800">
                        Comanda <span className="font-mono font-bold">{selectedTable.comanda.code}</span> aberta.
                      </p>
                      <p className="text-xs text-green-700">Peça para o cliente escanear o QR para confirmar os dados.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {orderType === 'delivery' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buscar cliente pelo WhatsApp
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => { setCustomerPhone(e.target.value); setCustomerId(null) }}
                    onBlur={() => { if (customerPhone && !customerId) void lookupCustomer() }}
                    placeholder="5511999999999"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => void lookupCustomer()}
                    disabled={customerPhone.replace(/\D/g, '').length < 10}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40 transition-colors"
                  >
                    Buscar
                  </button>
                </div>
                {customerId && (
                  <p className="text-xs text-green-600 mt-1.5">
                    Cliente encontrado: {customerName || customerPhone}
                    {savedAddresses.length > 0 && ` · ${savedAddresses.length} endereço(s)`}
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={goNext}
                disabled={orderType === 'table' && (!selectedTable || !selectedTable.comanda)}
                className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-xl disabled:opacity-40 hover:bg-brand-700 transition-colors active:scale-95"
              >
                Montar pedido →
              </button>
            </div>
          </div>
        )}

        {/* Step: menu */}
        {step === 'menu' && (
          <div className="flex flex-col md:flex-row">
            {/* Products */}
            <div className="flex-1 flex flex-col min-w-0 md:border-r border-gray-100">
              <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <input
                  type="search"
                  placeholder="Buscar item..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setActiveCat(null) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-2"
                />
                {!search && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                      onClick={() => setActiveCat(null)}
                      className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        !activeCat ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Todos
                    </button>
                    {allCatalogs.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setActiveCat(c.id)}
                        className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          activeCat === c.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 space-y-4">
                {filteredCatalogs.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-8">Nenhum item encontrado</p>
                )}
                {filteredCatalogs.map((cat) => (
                  <div key={cat.id}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat.name}</p>
                    <div className="space-y-1">
                      {cat.products.map((p) => {
                        const inCart = cart.find((i) => i.productId === p.id)
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors"
                          >
                            <div className="min-w-0 flex-1 mr-3">
                              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                              {p.description && <p className="text-xs text-gray-400 truncate">{p.description}</p>}
                              <p className="text-sm font-semibold text-brand-600 mt-0.5">{formatBRL(p.price)}</p>
                            </div>
                            {inCart ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => updateQty(p.id, inCart.quantity - 1)}
                                  className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 font-bold flex items-center justify-center hover:bg-gray-300 transition-colors"
                                >
                                  −
                                </button>
                                <span className="w-5 text-center text-sm font-semibold">{inCart.quantity}</span>
                                <button
                                  onClick={() => updateQty(p.id, inCart.quantity + 1)}
                                  className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center hover:bg-brand-700 transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(p)}
                                className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center hover:bg-brand-700 transition-colors flex-shrink-0"
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {menu && menu.withoutCatalog.length > 0 && !activeCat && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Outros</p>
                    <div className="space-y-1">
                      {menu.withoutCatalog.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())).map((p) => {
                        const inCart = cart.find((i) => i.productId === p.id)
                        return (
                          <div key={p.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50">
                            <div className="min-w-0 flex-1 mr-3">
                              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                              <p className="text-sm font-semibold text-brand-600 mt-0.5">{formatBRL(p.price)}</p>
                            </div>
                            {inCart ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button onClick={() => updateQty(p.id, inCart.quantity - 1)} className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 font-bold flex items-center justify-center">−</button>
                                <span className="w-5 text-center text-sm font-semibold">{inCart.quantity}</span>
                                <button onClick={() => updateQty(p.id, inCart.quantity + 1)} className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center">+</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(p)} className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center flex-shrink-0">+</button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Cart sidebar */}
            <div className="w-full md:w-64 flex-shrink-0 flex flex-col md:sticky md:top-0 md:self-start">
              <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <p className="text-sm font-semibold text-gray-700">
                  {orderType === 'table' && selectedTable ? `Mesa ${selectedTable.number}` : ORDER_TYPE_LABELS[orderType]}
                  {selectedTable?.comanda && (
                    <span className="ml-1.5 text-xs font-mono text-brand-500">{selectedTable.comanda.code}</span>
                  )}
                </p>
              </div>

              <div className="px-4 py-3">
                {cart.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Nenhum item adicionado</p>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div key={item.productId} className="text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800 flex-1 min-w-0 truncate pr-2">{item.productName}</span>
                          <button onClick={() => updateQty(item.productId, 0)} className="text-gray-300 hover:text-red-500 transition-colors text-xs flex-shrink-0">✕</button>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => updateQty(item.productId, item.quantity - 1)} className="w-5 h-5 rounded bg-gray-100 text-gray-600 font-bold flex items-center justify-center text-xs">−</button>
                            <span className="text-xs font-semibold w-4 text-center">{item.quantity}</span>
                            <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="w-5 h-5 rounded bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xs">+</button>
                          </div>
                          <span className="text-xs text-gray-500">{formatBRL(item.unitPrice * item.quantity)}</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Observação..."
                          value={item.notes}
                          onChange={(e) => updateItemNotes(item.productId, e.target.value)}
                          className="mt-1 w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">Total</span>
                  <span className="text-base font-bold text-gray-900">{formatBRL(total)}</span>
                </div>
                <button
                  onClick={goNext}
                  disabled={cart.length === 0}
                  className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-brand-700 transition-colors active:scale-[0.98]"
                >
                  Revisar pedido →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: agendamento */}
        {step === 'schedule' && (
          <>
            <ScheduleStep
              isScheduled={isScheduled}
              scheduledFor={scheduledFor}
              onToggleScheduled={setIsScheduled}
              onScheduledForChange={setScheduledFor}
            />
            <div className="px-6 pb-6">
              <button
                onClick={goNext}
                disabled={isScheduled && scheduledFor.length === 0}
                className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-brand-700 transition-colors active:scale-[0.98]"
              >
                Continuar →
              </button>
            </div>
          </>
        )}

        {/* Step: entrega */}
        {step === 'delivery' && (
          <>
            <DeliveryStep
              address={deliveryAddress}
              complement={deliveryComplement}
              savedAddresses={savedAddresses.length > 0 ? savedAddresses : undefined}
              onAddressChange={setDeliveryAddress}
              onComplementChange={setDeliveryComplement}
            />
            <div className="px-6 pb-6">
              <button
                onClick={goNext}
                disabled={deliveryAddress.trim().length === 0}
                className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-brand-700 transition-colors active:scale-[0.98]"
              >
                Continuar →
              </button>
            </div>
          </>
        )}

        {/* Step: pagamento */}
        {step === 'payment' && (
          <>
            <PaymentStep
              payments={payments}
              total={total}
              paymentTypeOptions={paymentTypeOptions}
              onChange={setPayments}
            />
            <div className="px-6 pb-6">
              <button
                onClick={goNext}
                disabled={!paymentsValid}
                className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-brand-700 transition-colors active:scale-[0.98]"
              >
                Continuar →
              </button>
            </div>
          </>
        )}

        {/* Step: confirm */}
        {step === 'confirm' && (
          <div className="p-5 space-y-5">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">Resumo</p>
                <span className="text-xs px-2 py-1 bg-brand-100 text-brand-700 rounded-full font-medium">
                  {ORDER_TYPE_LABELS[orderType]}
                  {selectedTable && ` · Mesa ${selectedTable.number}`}
                  {selectedTable?.comanda && ` · ${selectedTable.comanda.code}`}
                </span>
              </div>
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.productId} className="flex items-start justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-800">{item.quantity}× {item.productName}</span>
                      {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
                    </div>
                    <span className="text-gray-600 ml-3 flex-shrink-0">{formatBRL(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-lg font-bold text-brand-600">{formatBRL(total)}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do cliente (opcional)</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do cliente"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <span className="text-sm text-gray-700">Cliente solicitou Nota Fiscal?</span>
              <button
                onClick={() => setRequiresFiscal((prev) => !prev)}
                className={`relative w-11 h-6 rounded-full transition-colors ${requiresFiscal ? 'bg-brand-600' : 'bg-gray-200'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${requiresFiscal ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {requiresFiscal && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ para a nota</label>
                <input
                  type="text"
                  value={customerDocument}
                  onChange={(e) => setCustomerDocument(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {fiscalBlocked && (
                  <p className="text-xs text-amber-600 mt-1">Informe o CPF/CNPJ para emitir a nota fiscal.</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação geral</label>
              <textarea
                value={globalNotes}
                onChange={(e) => setGlobalNotes(e.target.value)}
                placeholder="Ex: cliente com alergia a amendoim..."
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {mutation.isError && mutation.error instanceof ApiError && mutation.error.code === 'table_comanda_required' && selectedTable && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-800">{mutation.error.message}</p>
                <button
                  onClick={() => openComandaMutation.mutate(selectedTable.id)}
                  disabled={openComandaMutation.isPending}
                  className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-amber-700 transition-colors active:scale-95 flex-shrink-0"
                >
                  {openComandaMutation.isPending ? 'Abrindo...' : 'Abrir comanda'}
                </button>
              </div>
            )}
            {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.code === 'table_comanda_required') && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                {mutation.error instanceof Error ? mutation.error.message : 'Erro ao criar pedido'}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={mutation.isPending || fiscalBlocked}
              className="w-full py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors active:scale-[0.98]"
            >
              {mutation.isPending ? 'Enviando...' : `Confirmar pedido · ${formatBRL(total)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
