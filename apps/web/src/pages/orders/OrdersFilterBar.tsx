import { Select } from '@/components/ui/Select'
import { ORDER_TYPE_LABELS, ORDER_CHANNEL_LABELS, type OrderType } from '@/constants/orderLabels'

const TYPE_OPTIONS = (Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((value) => ({
  value,
  label: ORDER_TYPE_LABELS[value],
}))

const CHANNEL_OPTIONS = Object.entries(ORDER_CHANNEL_LABELS).map(([value, label]) => ({ value, label }))

interface OrdersFilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  types: OrderType[]
  onTypesChange: (value: OrderType[]) => void
  channels: string[]
  onChannelsChange: (value: string[]) => void
  dateFrom: string
  onDateFromChange: (value: string) => void
  dateTo: string
  onDateToChange: (value: string) => void
  hasActiveFilters: boolean
  onClearFilters: () => void
}

export function OrdersFilterBar({
  search,
  onSearchChange,
  types,
  onTypesChange,
  channels,
  onChannelsChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  hasActiveFilters,
  onClearFilters,
}: OrdersFilterBarProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-5 gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por cliente, telefone ou nº do pedido..."
          className="desktop:col-span-2 w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        <Select
          multiple
          options={TYPE_OPTIONS}
          value={types}
          onChange={onTypesChange}
          placeholder="Tipo"
        />

        <Select
          multiple
          options={CHANNEL_OPTIONS}
          value={channels}
          onChange={onChannelsChange}
          placeholder="Canal"
        />

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <span className="text-gray-400 text-sm">até</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="mt-3 text-xs text-brand-600 hover:text-brand-700 font-medium underline-offset-2 hover:underline"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}
