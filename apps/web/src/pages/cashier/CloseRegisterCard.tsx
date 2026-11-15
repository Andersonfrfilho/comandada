import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { PAYMENT_LABELS, closingDifference, formatBRL, parseMoneyInput } from './cashierFormat'

export interface PaymentMethodTotal {
  method: string | null
  received: string
  refunded: string
  net: string
}

interface CloseRegisterCardProps {
  registerId: string
  expectedCash: string
  byMethod: PaymentMethodTotal[]
  hidden: boolean
  onClosed: () => void
}

/**
 * Fechamento em dois passos: a pessoa conta a gaveta, confere esperado x contado e só então fecha.
 * Com diferença, o motivo é obrigatório (fica no histórico de fechamentos).
 */
export function CloseRegisterCard({ registerId, expectedCash, byMethod, hidden, onClosed }: CloseRegisterCardProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const [countedInput, setCountedInput] = useState('')
  const [notes, setNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')

  const counted = parseMoneyInput(countedInput)
  const difference = counted === null ? null : closingDifference(counted, expectedCash)
  const hasDifference = difference !== null && difference !== 0
  const canClose = counted !== null && (!hasDifference || notes.trim().length > 0)

  const closeMutation = useMutation({
    mutationFn: () =>
      api.patch(
        `/cashier/registers/${registerId}/close`,
        { closingAmount: counted, ...(notes.trim() ? { notes: notes.trim() } : {}) },
        accessToken ?? undefined
      ),
    onSuccess: () => {
      setError('')
      setReviewing(false)
      setCountedInput('')
      setNotes('')
      onClosed()
    },
    onError: (closeError: Error) => setError(closeError.message),
  })

  const nonCashTotals = byMethod.filter((total) => total.method !== 'cash' && Number(total.net) !== 0)

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h2 className="font-semibold text-gray-900 mb-1">Fechar caixa</h2>
      <p className="text-sm text-gray-600 mb-3">
        Dinheiro que deve estar na gaveta: <strong className="text-gray-900">{formatBRL(expectedCash, hidden)}</strong>
      </p>
      {nonCashTotals.length > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          Fora da gaveta (confira na maquininha e no extrato):{' '}
          {nonCashTotals
            .map((total) => `${total.method ? PAYMENT_LABELS[total.method] ?? total.method : 'Sem forma'} ${formatBRL(total.net, hidden)}`)
            .join(' · ')}
        </p>
      )}

      {!reviewing ? (
        <>
          <label htmlFor="closing-counted" className="block text-sm font-medium text-gray-700 mb-1">
            Dinheiro contado na gaveta (R$)
          </label>
          <input
            id="closing-counted"
            inputMode="decimal"
            value={countedInput}
            onChange={(event) => setCountedInput(event.target.value)}
            placeholder="Conte as notas e moedas"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-500 mb-3"
          />
          <button
            type="button"
            onClick={() => setReviewing(true)}
            disabled={counted === null}
            className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors"
          >
            Conferir fechamento
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">Esperado</dt>
              <dd className="font-bold text-gray-900">{formatBRL(expectedCash, hidden)}</dd>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">Contado</dt>
              <dd className="font-bold text-gray-900">{formatBRL(counted ?? 0, hidden)}</dd>
            </div>
            <div className={`rounded-xl p-3 ${!hasDifference ? 'bg-green-50' : difference! < 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
              <dt className="text-xs text-gray-500">Diferença</dt>
              <dd className={`font-bold ${!hasDifference ? 'text-green-700' : difference! < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                {!hasDifference ? 'Bateu' : `${difference! < 0 ? 'Falta' : 'Sobra'} ${formatBRL(Math.abs(difference!), hidden)}`}
              </dd>
            </div>
          </dl>

          {hasDifference && (
            <div>
              <label htmlFor="closing-notes" className="block text-sm font-medium text-gray-700 mb-1">
                O que aconteceu? (obrigatório quando não bate)
              </label>
              <input
                id="closing-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={500}
                placeholder="Ex.: troco dado a mais, pagamento lançado na forma errada"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setReviewing(false)}
              disabled={closeMutation.isPending}
              className="py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
            >
              Corrigir valor
            </button>
            <button
              type="button"
              onClick={() => closeMutation.mutate()}
              disabled={!canClose || closeMutation.isPending}
              className="py-3 bg-red-600 text-white font-bold rounded-xl disabled:opacity-40 hover:bg-red-700 transition-colors"
            >
              {closeMutation.isPending ? 'Fechando...' : 'Fechar caixa'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
