import { Select, type SelectOption } from '@/components/ui/Select'

export interface PaymentLeg {
  id: string
  paymentTypeName: string
  amount: string
  changeFor: string
  splitLabel: string
}

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface PaymentStepProps {
  payments: PaymentLeg[]
  total: number
  paymentTypeOptions: readonly SelectOption<string>[]
  onChange: (payments: PaymentLeg[]) => void
}

export function PaymentStep({ payments, total, paymentTypeOptions, onChange }: PaymentStepProps) {
  const allocated = payments.reduce((sum, leg) => sum + (Number(leg.amount) || 0), 0)
  const remaining = total - allocated
  const isBalanced = Math.abs(remaining) < 0.01

  function updateLeg(id: string, patch: Partial<PaymentLeg>) {
    onChange(payments.map((leg) => (leg.id === id ? { ...leg, ...patch } : leg)))
  }

  function addLeg() {
    onChange([
      ...payments,
      {
        id: crypto.randomUUID(),
        paymentTypeName: '',
        amount: remaining > 0 ? remaining.toFixed(2) : '',
        changeFor: '',
        splitLabel: '',
      },
    ])
  }

  function removeLeg(id: string) {
    if (payments.length <= 1) return
    onChange(payments.filter((leg) => leg.id !== id))
  }

  return (
    <div className="p-6 space-y-4">
      {payments.map((leg, index) => (
        <div key={leg.id} className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Pagamento {index + 1}</p>
            {payments.length > 1 && (
              <button
                onClick={() => removeLeg(leg.id)}
                className="text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                Remover
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Forma de pagamento</label>
              <Select
                options={paymentTypeOptions}
                value={leg.paymentTypeName || null}
                onChange={(value) => updateLeg(leg.id, { paymentTypeName: value })}
                placeholder="Selecionar..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={leg.amount}
                onChange={(e) => updateLeg(leg.id, { amount: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {leg.paymentTypeName === 'dinheiro' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Troco para (opcional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={leg.changeFor}
                onChange={(e) => updateLeg(leg.id, { changeFor: e.target.value })}
                placeholder="Ex: 50.00"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {payments.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Identificação (opcional)</label>
              <input
                type="text"
                value={leg.splitLabel}
                onChange={(e) => updateLeg(leg.id, { splitLabel: e.target.value })}
                placeholder="Ex: Pessoa 1"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
        </div>
      ))}

      <button
        onClick={addLeg}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 text-gray-500 text-sm font-medium rounded-xl hover:border-brand-400 hover:text-brand-600 transition-colors"
      >
        + Dividir pagamento
      </button>

      <div
        className={`rounded-xl px-4 py-3 text-sm font-medium ${
          isBalanced ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
        }`}
      >
        {isBalanced
          ? `Total alocado: ${formatBRL(allocated)}`
          : remaining > 0
          ? `Faltam ${formatBRL(remaining)} para completar o total de ${formatBRL(total)}`
          : `Valor excede o total em ${formatBRL(Math.abs(remaining))}`}
      </div>
    </div>
  )
}
