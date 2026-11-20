import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Minus, Plus, Search, UserCheck, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, useCan } from '@/stores/authStore'
import { formatPhoneInput, isValidPhone, phoneDigits } from './waiterModel'

interface CustomerHit {
  id: string
  name: string
  whatsappNumber: string
}

export interface OpenComandaPayload {
  customerId?: string
  customerName?: string
  customerPhone?: string
  guestsCount: number
}

interface OpenComandaFormProps {
  tableNumber: number
  capacity: number
  submitting: boolean
  onSubmit(payload: OpenComandaPayload): void
  onCancel?: () => void
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

function displayPhone(whatsappNumber: string): string {
  return formatPhoneInput(whatsappNumber)
}

/**
 * Abertura de comanda com os dados do cliente: procura quem já é cliente (nome ou telefone) ou digita
 * nome e telefone de quem chegou agora — a API cadastra pelo telefone. Pessoas na mesa sempre.
 */
export function OpenComandaForm({ tableNumber, capacity, submitting, onSubmit, onCancel }: OpenComandaFormProps) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const canSearchCustomers = useCan({ resource: 'customers', action: 'read' })
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CustomerHit | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [guests, setGuests] = useState(Math.min(2, Math.max(1, capacity)))
  const [error, setError] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search.trim(), 300)

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ['waiter-customer-search', debouncedSearch],
    queryFn: async () => {
      const digits = debouncedSearch.replace(/\D/g, '')
      const term = digits.length >= 4 ? digits : debouncedSearch
      const result = await api.get<{ data: CustomerHit[] }>(
        `/customers?search=${encodeURIComponent(term)}&pageSize=5`,
        accessToken
      )
      return result.data
    },
    enabled: canSearchCustomers && !selected && debouncedSearch.length >= 2,
    staleTime: 30_000,
  })

  function pick(customer: CustomerHit) {
    setSelected(customer)
    setName(customer.name)
    setPhone(displayPhone(customer.whatsappNumber))
    setSearch('')
  }

  function clearSelection() {
    setSelected(null)
    setName('')
    setPhone('')
  }

  function submit() {
    setError(null)
    const trimmedName = name.trim()
    const hasPhone = phoneDigits(phone).length > 0
    if (hasPhone && !isValidPhone(phone)) {
      setError('Telefone com DDD, ex.: (16) 99999-1234')
      return
    }
    if (trimmedName && trimmedName.length < 2) {
      setError('Nome muito curto')
      return
    }
    onSubmit({
      guestsCount: guests,
      ...(selected ? { customerId: selected.id } : {}),
      ...(trimmedName ? { customerName: trimmedName } : {}),
      ...(!selected && hasPhone ? { customerPhone: phoneDigits(phone) } : {}),
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-900">Quantas pessoas?</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setGuests((value) => Math.max(1, value - 1))}
            aria-label="Menos uma pessoa"
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-white ring-1 ring-gray-300 active:scale-95"
          >
            <Minus className="h-5 w-5" />
          </button>
          <span className="w-12 text-center text-3xl font-black tabular-nums">{guests}</span>
          <button
            onClick={() => setGuests((value) => Math.min(50, value + 1))}
            aria-label="Mais uma pessoa"
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-white ring-1 ring-gray-300 active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>
          <span className="text-xs text-gray-500">mesa para {capacity}</span>
        </div>
      </div>

      {canSearchCustomers && !selected && (
        <div className="relative">
          <label htmlFor="waiter-customer-search" className="mb-1 block text-sm font-semibold text-gray-900">
            Já é cliente?
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="waiter-customer-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou telefone"
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {debouncedSearch.length >= 2 && (
            <ul className="mt-1 overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
              {hits.map((customer) => (
                <li key={customer.id} className="border-b border-gray-100 last:border-0">
                  <button onClick={() => pick(customer)} className="flex min-h-[48px] w-full flex-col justify-center px-3 py-2 text-left active:bg-gray-50">
                    <span className="text-sm font-semibold text-gray-900">{customer.name}</span>
                    <span className="text-xs text-gray-500">{displayPhone(customer.whatsappNumber)}</span>
                  </button>
                </li>
              ))}
              {hits.length === 0 && !isFetching && (
                <li className="px-3 py-3 text-sm text-gray-500">Ninguém com esse nome ou telefone. Preencha abaixo.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {selected && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200">
          <UserCheck className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-emerald-900">{selected.name}</p>
            <p className="text-xs text-emerald-700">Cliente cadastrado · {displayPhone(selected.whatsappNumber)}</p>
          </div>
          <button onClick={clearSelection} aria-label="Trocar cliente" className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-700 active:bg-emerald-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-3">
        <div>
          <label htmlFor="waiter-customer-name" className="mb-1 block text-sm font-semibold text-gray-900">
            Nome do cliente
          </label>
          <input
            id="waiter-customer-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Como chamar na mesa"
            autoComplete="off"
            autoCapitalize="words"
            className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        {!selected && (
          <div>
            <label htmlFor="waiter-customer-phone" className="mb-1 block text-sm font-semibold text-gray-900">
              Telefone / WhatsApp <span className="font-normal text-gray-500">(opcional)</span>
            </label>
            <input
              id="waiter-customer-phone"
              value={phone}
              onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
              placeholder="(16) 99999-1234"
              inputMode="tel"
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-gray-500">Com nome e telefone o cliente fica cadastrado para a próxima visita.</p>
          </div>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button onClick={onCancel} className="h-12 rounded-xl px-4 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 active:scale-95">
            Cancelar
          </button>
        )}
        <button
          onClick={submit}
          disabled={submitting}
          className="h-12 flex-1 rounded-xl bg-brand-600 text-base font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Abrindo...' : `Abrir comanda na mesa ${tableNumber}`}
        </button>
      </div>
    </div>
  )
}
