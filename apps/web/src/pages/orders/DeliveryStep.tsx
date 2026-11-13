import { useState } from 'react'
import { MapPin, Home, Briefcase } from 'lucide-react'

export interface SavedAddress {
  id: string
  label: string | null
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  zip: string | null
  isDefault: boolean
}

interface DeliveryStepProps {
  address: string
  complement: string
  savedAddresses?: SavedAddress[]
  onAddressChange: (value: string) => void
  onComplementChange: (value: string) => void
  onSelectSavedAddress?: (address: SavedAddress) => void
}

const LABEL_ICONS: Record<string, typeof Home> = {
  casa: Home,
  trabalho: Briefcase,
}

export function DeliveryStep({
  address,
  complement,
  savedAddresses,
  onAddressChange,
  onComplementChange,
  onSelectSavedAddress,
}: DeliveryStepProps) {
  const [showManual, setShowManual] = useState(false)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)

  function handleSelectSaved(addrId: string) {
    const addr = savedAddresses?.find((a) => a.id === addrId)
    if (!addr) return
    setSelectedAddressId(addrId)
    const full = `${addr.street}, ${addr.number} - ${addr.neighborhood}, ${addr.city}/${addr.state}${addr.zip ? ` · CEP ${addr.zip}` : ''}`
    onAddressChange(full)
    onComplementChange(addr.complement ?? '')
    onSelectSavedAddress?.(addr)
  }

  const hasAddresses = savedAddresses && savedAddresses.length > 0

  return (
    <div className="p-6 space-y-5">
      {hasAddresses && !showManual && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Endereço salvo do cliente
          </label>
          <div className="space-y-2">
            {savedAddresses.map((addr) => {
              const Icon = addr.label && LABEL_ICONS[addr.label] ? LABEL_ICONS[addr.label] : MapPin
              return (
                <button
                  key={addr.id}
                  onClick={() => handleSelectSaved(addr.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    selectedAddressId === addr.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-brand-300 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {addr.label && (
                          <span className="text-sm font-medium text-gray-900">{addr.label}</span>
                        )}
                        {addr.isDefault && (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            Padrão
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 leading-snug">
                        {addr.street}, {addr.number}
                      </p>
                      <p className="text-xs text-gray-400">
                        {addr.neighborhood} · {addr.city}/{addr.state}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <button
            onClick={() => { setShowManual(true); setSelectedAddressId(null); onAddressChange(''); onComplementChange('') }}
            className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            Ou digitar novo endereço
          </button>
        </div>
      )}

      {(showManual || !hasAddresses) && (
        <>
          {hasAddresses && (
            <button
              onClick={() => setShowManual(false)}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              ← Selecionar endereço salvo
            </button>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço completo</label>
            <input
              type="text"
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Rua, número, bairro, cidade"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Complemento (opcional)</label>
            <input
              type="text"
              value={complement}
              onChange={(e) => onComplementChange(e.target.value)}
              placeholder="Apto, bloco, referência..."
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </>
      )}

      <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
        A taxa de entrega é calculada automaticamente com base no endereço ao confirmar o pedido.
      </p>
    </div>
  )
}
