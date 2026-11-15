import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'

export function FilterBar({ children, onClear, hasActiveFilters }: {
  readonly children: ReactNode
  readonly onClear?: () => void
  readonly hasActiveFilters?: boolean
}): JSX.Element {
  return (
    <div className="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap items-end gap-3">
      {children}
      {onClear && hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <X className="h-4 w-4" />
          Limpar filtros
        </button>
      )}
    </div>
  )
}

export function FilterField({ label, children, className = 'w-full sm:w-44' }: {
  readonly label: string
  readonly children: ReactNode
  readonly className?: string
}): JSX.Element {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

export function SearchField({ value, onChange, placeholder, label = 'Buscar' }: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder: string
  readonly label?: string
}): JSX.Element {
  return (
    <FilterField label={label} className="flex-1 min-w-[200px]">
      <span className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </span>
    </FilterField>
  )
}

// Select nativo: acessível, leve e bom no celular para filtros de uma escolha.
export function FilterSelect<TValue extends string>({ value, onChange, options, allLabel = 'Todos' }: {
  readonly value: TValue | ''
  readonly onChange: (value: TValue | '') => void
  readonly options: ReadonlyArray<{ readonly value: TValue; readonly label: string }>
  readonly allLabel?: string
}): JSX.Element {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as TValue | '')}
      className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
