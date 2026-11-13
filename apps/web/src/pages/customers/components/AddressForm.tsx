import { useState, useCallback, useRef } from 'react'
import { MapPin, Search, Loader2, Trash2, Star, Plus } from 'lucide-react'
import { API_URL } from '@/lib/apiEndpoints'

export interface AddressFormData {
  id?: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  zip: string
  label: string
  lat?: number | null
  lng?: number | null
  isDefault?: boolean
}

const emptyAddress: AddressFormData = {
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  zip: '',
  label: '',
  lat: null,
  lng: null,
}

interface CepResult {
  street: string
  neighborhood: string
  city: string
  state: string
}

function buildOsmStaticUrl(lat: number, lng: number): string {
  const zoom = 16
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.003},${lng + 0.005},${lat + 0.003}&amp;layer=mapnik&amp;marker=${lat},${lng}`
}

export function AddressForm({
  onSave,
  onCancel,
  initialValues,
}: {
  onSave: (data: AddressFormData) => void
  onCancel: () => void
  initialValues?: Partial<AddressFormData>
}) {
  const [form, setForm] = useState<AddressFormData>({ ...emptyAddress, ...initialValues })
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)
  const cepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const formatZip = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/^(\d{5})(\d)/, '$1-$2')
      .slice(0, 9)
  }

  const handleCepChange = useCallback((value: string) => {
    const formatted = formatZip(value)
    setForm((f) => ({ ...f, zip: formatted }))
    setCepError(null)

    const clean = value.replace(/\D/g, '')
    if (clean.length !== 8) return

    if (cepTimer.current) clearTimeout(cepTimer.current)
    cepTimer.current = setTimeout(async () => {
      setCepLoading(true)
      try {
        const response = await fetch(`${API_URL}/addresses/cep/${clean}`)
        const data = await response.json() as CepResult | null
        if (data) {
          setForm((f) => ({
            ...f,
            street: data.street,
            neighborhood: data.neighborhood,
            city: data.city,
            state: data.state.toUpperCase(),
          }))
        } else {
          setCepError('CEP não encontrado')
        }
      } catch {
        setCepError('Erro ao consultar CEP')
      } finally {
        setCepLoading(false)
      }
    }, 400)
  }, [])

  const hasCoords = form.lat != null && form.lng != null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Apelido</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Ex: Casa, Trabalho..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
          <div className="relative">
            <input
              type="text"
              value={form.zip}
              onChange={(e) => handleCepChange(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            {cepLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
            )}
          </div>
          {cepError && <p className="text-xs text-red-500 mt-1">{cepError}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Rua *</label>
          <input
            type="text"
            value={form.street}
            onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
            placeholder="Nome da rua"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Número *</label>
          <input
            type="text"
            value={form.number}
            onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
            placeholder="123"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
        <input
          type="text"
          value={form.complement}
          onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))}
          placeholder="Apto 42, Bloco B"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bairro *</label>
          <input
            type="text"
            value={form.neighborhood}
            onChange={(e) => setForm((f) => ({ ...f, neighborhood: e.target.value }))}
            placeholder="Bairro"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            placeholder="Cidade"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estado *</label>
          <input
            type="text"
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
            placeholder="SP"
            maxLength={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      </div>

      {hasCoords && (
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <iframe
            title="Mapa do endereço"
            width="100%"
            height="180"
            style={{ border: 0 }}
            loading="lazy"
            src={buildOsmStaticUrl(form.lat!, form.lng!)}
          />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={!form.street || !form.number || !form.neighborhood || !form.city || !form.state}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors active:scale-95"
        >
          Salvar endereço
        </button>
      </div>
    </div>
  )
}

interface AddressCardProps {
  address: AddressFormData
  onEdit: (address: AddressFormData) => void
  onDelete: (id: string) => void
  onSetDefault: (id: string) => void
}

export function AddressCard({ address, onEdit, onDelete, onSetDefault }: AddressCardProps) {
  const hasCoords = address.lat != null && address.lng != null
  const fullAddress = `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ''}`
  const locale = `${address.neighborhood} - ${address.city}/${address.state}${address.zip ? ` · ${address.zip}` : ''}`

  return (
    <div className={`bg-white rounded-lg border p-3 ${address.isDefault ? 'border-brand-300 ring-1 ring-brand-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            {address.label && (
              <span className="text-sm font-medium text-gray-900">{address.label}</span>
            )}
            {address.isDefault && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-brand-100 text-brand-700">
                <Star className="h-3 w-3 fill-current" />
                Padrão
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">{fullAddress}</p>
          <p className="text-xs text-gray-400 mt-0.5">{locale}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(address)}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Editar"
          >
            <MapPin className="h-4 w-4" />
          </button>
          {!address.isDefault && (
            <button
              onClick={() => address.id && onSetDefault(address.id)}
              className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
              title="Definir como padrão"
            >
              <Star className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => address.id && onDelete(address.id)}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {hasCoords && (
        <div className="mt-2 rounded overflow-hidden border border-gray-100">
          <iframe
            title="Mapa do endereço"
            width="100%"
            height="120"
            style={{ border: 0 }}
            loading="lazy"
            src={buildOsmStaticUrl(address.lat!, address.lng!)}
          />
        </div>
      )}
    </div>
  )
}
