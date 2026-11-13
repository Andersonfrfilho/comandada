import { useEffect, useMemo, useRef, useState } from 'react'

export type SelectOption<TValue extends string> = {
  readonly value: TValue
  readonly label: string
}

type SelectSingleProps<TValue extends string> = {
  readonly options: readonly SelectOption<TValue>[]
  readonly value: TValue | null
  readonly onChange: (value: TValue) => void
  readonly multiple?: false
  readonly placeholder?: string
  readonly searchable?: boolean
  readonly disabled?: boolean
  readonly error?: string
}

type SelectMultiProps<TValue extends string> = {
  readonly options: readonly SelectOption<TValue>[]
  readonly value: readonly TValue[]
  readonly onChange: (value: TValue[]) => void
  readonly multiple: true
  readonly placeholder?: string
  readonly searchable?: boolean
  readonly disabled?: boolean
  readonly error?: string
}

export type SelectProps<TValue extends string> = SelectSingleProps<TValue> | SelectMultiProps<TValue>

export function Select<TValue extends string>(props: SelectProps<TValue>): JSX.Element {
  const { options, placeholder = 'Selecionar...', searchable = false, disabled = false, error } = props

  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedValues: readonly TValue[] = props.multiple ? props.value : props.value === null ? [] : [props.value]

  const filteredOptions = useMemo(() => {
    if (!searchable || searchTerm.trim().length === 0) return options
    const term = searchTerm.trim().toLowerCase()
    return options.filter((option) => option.label.toLowerCase().includes(term))
  }, [options, searchable, searchTerm])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
      return
    }
    if (searchable) searchInputRef.current?.focus()
  }, [isOpen, searchable])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredOptions])

  function handleSelect(option: SelectOption<TValue>): void {
    if (props.multiple) {
      const isSelected = selectedValues.includes(option.value)
      const nextValues = isSelected
        ? selectedValues.filter((current) => current !== option.value)
        : [...selectedValues, option.value]
      props.onChange(nextValues)
      return
    }
    props.onChange(option.value)
    setIsOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (disabled) return
    if (event.key === 'Escape') {
      setIsOpen(false)
      return
    }
    if (!isOpen) {
      if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === ' ') {
        event.preventDefault()
        setIsOpen(true)
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = filteredOptions[highlightedIndex]
      if (option) handleSelect(option)
    }
  }

  const triggerLabel = useMemo(() => {
    if (selectedValues.length === 0) return placeholder
    const labels = options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label)
    return labels.join(', ')
  }, [selectedValues, options, placeholder])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 border rounded-xl text-sm text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? 'border-red-400' : 'border-gray-300'
        } ${selectedValues.length === 0 ? 'text-gray-400' : 'text-gray-900'}`}
      >
        <span className="truncate">{triggerLabel}</span>
        <svg
          className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar..."
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
          <ul role="listbox" aria-multiselectable={props.multiple} className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">Nenhum resultado</li>}
            {filteredOptions.map((option, index) => {
              const isSelected = selectedValues.includes(option.value)
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => handleSelect(option)}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                    index === highlightedIndex ? 'bg-brand-50' : ''
                  } ${isSelected ? 'font-medium text-brand-700' : 'text-gray-700'}`}
                >
                  {props.multiple && (
                    <span
                      className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center ${
                        isSelected ? 'bg-brand-500 border-brand-500' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                  )}
                  <span className="truncate">{option.label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
