import { AlertTriangle } from 'lucide-react'
import { formatBRL } from '@/lib/listing'

export interface DeliveryFeeQuote {
  feeAmount: number
  distanceKm: number | null
  ruleConfigured: boolean
  freeShipping: boolean
  outOfRange: boolean
  maxRadiusKm: number | null
  freeAbove: number | null
}

interface DeliveryFeeBoxProps {
  quote: DeliveryFeeQuote | null
  value: string
  itemsTotal: number
  onChange: (value: string) => void
}

/**
 * Taxa calculada pela regra (frete grátis e raio iguais ao bot), editável pela atendente. Sem regra
 * cadastrada a taxa não sai mais zero em silêncio: o quadro avisa e pede para digitar.
 */
export function DeliveryFeeBox({ quote, value, itemsTotal, onChange }: DeliveryFeeBoxProps) {
  return (
    <div className="mx-6 mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="delivery-fee" className="text-sm font-medium text-gray-800">
          Taxa de entrega (R$)
        </label>
        <input
          id="delivery-fee"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-right text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <p className="text-xs text-gray-500">
        Itens {formatBRL(itemsTotal)}
        {quote?.distanceKm != null && ` · ${quote.distanceKm.toLocaleString('pt-BR')} km`}
      </p>
      {quote?.freeShipping && (
        <p className="text-xs font-medium text-green-700">
          Frete grátis: pedido acima de {formatBRL(quote.freeAbove ?? 0)}.
        </p>
      )}
      {quote && !quote.ruleConfigured && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          Nenhuma regra de taxa cadastrada (Configurações → Entrega). Digite a taxa combinada com o cliente.
        </p>
      )}
      {!quote && (
        <p className="text-xs text-amber-800">Não consegui calcular a taxa agora. Digite o valor.</p>
      )}
      {quote?.outOfRange && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          Endereço fora do raio de entrega ({quote.maxRadiusKm?.toLocaleString('pt-BR')} km). Confirme com o cliente antes de seguir.
        </p>
      )}
    </div>
  )
}
