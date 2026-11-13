import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Select, type SelectOption } from '@/components/ui/Select'

interface CashMovement {
  id: string
  type: 'payment' | 'withdrawal' | 'supply'
  paymentMethod: string | null
  amount: string
  notes: string | null
  createdAt: string
}

interface CurrentRegister {
  id: string
  status: 'open' | 'closed'
  openingAmount: string
  openedAt: string
  movements: CashMovement[]
  totalIn: string
  totalOut: string
  balance: string
}

interface FiscalDoc {
  id: string
  orderId: string
  status: string
  chaveAcesso: string | null
  numeroDocumento: number | null
  totalLiquido: string | null
  createdAt: string
}

const MOVEMENT_LABELS = { payment: 'Pagamento', withdrawal: 'Retirada', supply: 'Suprimento' }
const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix', card_credit: 'Crédito', card_debit: 'Débito', cash: 'Dinheiro', voucher: 'Voucher',
}

const MOVEMENT_TYPE_OPTIONS: readonly SelectOption<'payment' | 'withdrawal' | 'supply'>[] = [
  { value: 'payment', label: 'Pagamento' },
  { value: 'withdrawal', label: 'Retirada' },
  { value: 'supply', label: 'Suprimento' },
]

const PAYMENT_METHOD_OPTIONS: readonly SelectOption<'pix' | 'card_credit' | 'card_debit' | 'cash' | 'voucher'>[] = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'card_credit', label: 'Crédito' },
  { value: 'card_debit', label: 'Débito' },
  { value: 'voucher', label: 'Voucher' },
]

const HIDDEN_VALUE_PLACEHOLDER = 'R$ ••••••'

function formatBRL(value: string | number, hidden: boolean) {
  if (hidden) return HIDDEN_VALUE_PLACEHOLDER
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function CashierPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [openingAmount, setOpeningAmount] = useState('0')
  const [closingAmount, setClosingAmount] = useState('0')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementType, setMovementType] = useState<'payment' | 'withdrawal' | 'supply'>('payment')
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card_credit' | 'card_debit' | 'cash' | 'voucher'>('cash')
  const [movementNotes, setMovementNotes] = useState('')
  const [openError, setOpenError] = useState('')
  const [closeError, setCloseError] = useState('')
  const [showValues, setShowValues] = useState(false)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cashier-current'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'metrics'] })
  }

  const { data: register, isLoading } = useQuery({
    queryKey: ['cashier-current'],
    queryFn: () => api.get<CurrentRegister | null>('/cashier/registers/current', accessToken ?? undefined),
    refetchInterval: 30_000,
  })

  const { data: fiscalDocs = [] } = useQuery({
    queryKey: ['fiscal-documents-list'],
    queryFn: () => api.get<FiscalDoc[]>('/fiscal-documents', accessToken ?? undefined),
    refetchInterval: 60_000,
  })

  const openMutation = useMutation({
    mutationFn: () =>
      api.post('/cashier/registers', { openingAmount: parseFloat(openingAmount) }, accessToken ?? undefined),
    onSuccess: () => { setOpenError(''); invalidate() },
    onError: (e: Error) => setOpenError(e.message),
  })

  const closeMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/cashier/registers/${id}/close`, { closingAmount: parseFloat(closingAmount) }, accessToken ?? undefined),
    onSuccess: () => { setCloseError(''); invalidate() },
    onError: (e: Error) => setCloseError(e.message),
  })

  const movementMutation = useMutation({
    mutationFn: () =>
      api.post('/cashier/movements', {
        type: movementType,
        paymentMethod,
        amount: parseFloat(movementAmount),
        ...(movementNotes ? { notes: movementNotes } : {}),
      }, accessToken ?? undefined),
    onSuccess: () => { setMovementAmount(''); setMovementNotes(''); invalidate() },
  })

  if (isLoading) {
    return <p className="text-gray-400 text-center py-16">Carregando caixa...</p>
  }

  const isOpen = !!register

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Caixa</h1>
        {isOpen && (
          <button
            type="button"
            onClick={() => setShowValues((current) => !current)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
          >
            {showValues ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
            {showValues ? 'Ocultar valores' : 'Mostrar valores'}
          </button>
        )}
      </div>

      {!isOpen ? (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Abrir caixa</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor inicial (R$)</label>
            <input
              type="number"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
              min="0"
              step="0.01"
            />
          </div>
          {openError && <p className="text-sm text-red-600 mb-3">{openError}</p>}
          <button
            onClick={() => openMutation.mutate()}
            disabled={openMutation.isPending}
            className="w-full py-3 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 hover:bg-green-700 transition-colors"
          >
            {openMutation.isPending ? 'Abrindo...' : 'Abrir caixa'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Balance cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Saldo atual</p>
              <p className="text-lg font-bold text-gray-900">{formatBRL(register.balance, !showValues)}</p>
            </div>
            <div className="bg-green-50 rounded-2xl shadow-sm p-4 text-center">
              <p className="text-xs text-green-600 mb-1">Entradas</p>
              <p className="text-lg font-bold text-green-700">{formatBRL(register.totalIn, !showValues)}</p>
            </div>
            <div className="bg-red-50 rounded-2xl shadow-sm p-4 text-center">
              <p className="text-xs text-red-500 mb-1">Saídas</p>
              <p className="text-lg font-bold text-red-600">{formatBRL(register.totalOut, !showValues)}</p>
            </div>
          </div>

          {/* Add movement */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Registrar movimento</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Select value={movementType} onChange={setMovementType} options={MOVEMENT_TYPE_OPTIONS} />
              <Select value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHOD_OPTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                type="number"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                placeholder="Valor (R$)"
                className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                min="0.01"
                step="0.01"
              />
              <input
                type="text"
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
                placeholder="Observação (opcional)"
                className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={() => movementMutation.mutate()}
              disabled={!movementAmount || movementMutation.isPending}
              className="w-full py-2.5 bg-brand-600 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-brand-700 transition-colors active:scale-[0.98]"
            >
              {movementMutation.isPending ? 'Registrando...' : 'Registrar'}
            </button>
          </div>

          {/* Movements list */}
          {register.movements.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 mb-1">
                Movimentos de hoje
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                Aberto às {formatTime(register.openedAt)} · inicial {formatBRL(register.openingAmount, !showValues)}
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {register.movements.map((m) => (
                  <div key={m.id} className="flex items-start justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-800">{MOVEMENT_LABELS[m.type]}</span>
                      {m.paymentMethod && (
                        <span className="ml-1.5 text-xs text-gray-400">{PAYMENT_LABELS[m.paymentMethod] ?? m.paymentMethod}</span>
                      )}
                      {m.notes && <p className="text-xs text-gray-400 mt-0.5">{m.notes}</p>}
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <span className={`font-semibold ${m.type === 'withdrawal' ? 'text-red-600' : 'text-green-600'}`}>
                        {m.type === 'withdrawal' ? '−' : '+'}{formatBRL(m.amount, !showValues)}
                      </span>
                      <p className="text-xs text-gray-400">{formatTime(m.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fiscal documents */}
          {fiscalDocs.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Notas Fiscais do dia</h2>
              <p className="text-xs text-gray-400 mb-3">{fiscalDocs.length} documento{fiscalDocs.length !== 1 ? 's' : ''}</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {fiscalDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        doc.status === 'authorized' ? 'bg-green-100 text-green-800' :
                        doc.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        doc.status === 'cancelled' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {doc.status === 'authorized' ? 'Autorizada' :
                         doc.status === 'rejected' ? 'Rejeitada' :
                         doc.status === 'cancelled' ? 'Cancelada' :
                         doc.status}
                      </span>
                      {doc.numeroDocumento && (
                        <span className="ml-1.5 text-xs text-gray-500">Nº {doc.numeroDocumento}</span>
                      )}
                    </div>
                    <span className="font-semibold text-gray-900">
                      {doc.totalLiquido ? formatBRL(doc.totalLiquido, !showValues) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Close register */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Fechar caixa</h2>
            <p className="text-xs text-gray-400 mb-3">Saldo esperado: {formatBRL(register.balance, !showValues)}</p>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor contado em caixa (R$)</label>
              <input
                type="number"
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
                min="0"
                step="0.01"
              />
            </div>
            {closingAmount !== '0' && Number(closingAmount) !== Number(register.balance) && (
              <p className={`text-xs mb-3 ${Number(closingAmount) < Number(register.balance) ? 'text-red-600' : 'text-orange-500'}`}>
                Diferença: {formatBRL(Math.abs(Number(closingAmount) - Number(register.balance)), !showValues)}
                {Number(closingAmount) < Number(register.balance) ? ' a menos' : ' a mais'}
              </p>
            )}
            {closeError && <p className="text-sm text-red-600 mb-3">{closeError}</p>}
            <button
              onClick={() => closeMutation.mutate(register.id)}
              disabled={closeMutation.isPending}
              className="w-full py-3 bg-red-600 text-white font-bold rounded-xl disabled:opacity-50 hover:bg-red-700 transition-colors"
            >
              {closeMutation.isPending ? 'Fechando...' : 'Fechar caixa'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
