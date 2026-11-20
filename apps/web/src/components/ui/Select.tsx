import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import {
  filterSelectOptions,
  firstEnabledIndex,
  lastEnabledIndex,
  nextEnabledIndex,
  popoverPlacement,
  selectTriggerLabel,
  typeaheadIndex,
  type PopoverPlacement,
} from './selectLogic'

// Select único do painel: no computador abre uma lista presa ao botão (num portal, então modal e
// cartão com overflow não cortam); no celular abre uma folha de baixo com opções grandes de tocar.
// Nunca usar <select> nativo nas telas: este é o padrão.

export type SelectOption<TValue extends string> = {
  readonly value: TValue
  readonly label: string
  // Linha menor embaixo do nome (preço, unidade, observação).
  readonly hint?: string
  readonly disabled?: boolean
}

export type SelectSize = 'sm' | 'md'

type SelectBaseProps<TValue extends string> = {
  readonly options: readonly SelectOption<TValue>[]
  readonly placeholder?: string
  // Busca dentro da lista. Padrão: liga sozinha com mais de 8 opções.
  readonly searchable?: boolean
  readonly disabled?: boolean
  readonly error?: string
  readonly size?: SelectSize
  readonly id?: string
  readonly ariaLabel?: string
  // Título da folha no celular; padrão: ariaLabel ou placeholder.
  readonly title?: string
  readonly className?: string
}

type SelectSingleProps<TValue extends string> = SelectBaseProps<TValue> & {
  readonly value: TValue | null
  readonly onChange: (value: TValue) => void
  readonly multiple?: false
}

type SelectMultiProps<TValue extends string> = SelectBaseProps<TValue> & {
  readonly value: readonly TValue[]
  readonly onChange: (value: TValue[]) => void
  readonly multiple: true
}

export type SelectProps<TValue extends string> = SelectSingleProps<TValue> | SelectMultiProps<TValue>

const AUTO_SEARCH_THRESHOLD = 8
const MOBILE_QUERY = '(max-width: 639px)'
const TYPEAHEAD_RESET_MS = 700

const TRIGGER_SIZE: Record<SelectSize, string> = {
  md: 'min-h-[44px] rounded-xl pl-3.5 pr-3 py-2 text-sm',
  sm: 'min-h-[40px] sm:min-h-[34px] rounded-lg pl-3 pr-2 py-1.5 text-sm',
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_QUERY).matches : false,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(MOBILE_QUERY)
    const update = (): void => setIsMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return isMobile
}

export function Select<TValue extends string>(props: SelectProps<TValue>): JSX.Element {
  const {
    options,
    placeholder = 'Selecionar...',
    disabled = false,
    error,
    size = 'md',
    id,
    ariaLabel,
    title,
    className = '',
  } = props
  const searchable = props.searchable ?? options.length > AUTO_SEARCH_THRESHOLD
  const isMobile = useIsMobile()
  const listboxId = useId()

  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null)
  const [fieldLabel, setFieldLabel] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const sheetRootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typedRef = useRef({ text: '', at: 0 })

  const selectedValues: readonly TValue[] = props.multiple ? props.value : props.value === null ? [] : [props.value]
  const filteredOptions = useMemo(
    () => (searchable ? filterSelectOptions(options, searchTerm) : options),
    [options, searchable, searchTerm],
  )
  const trigger = selectTriggerLabel(options, selectedValues, placeholder)

  const close = useCallback((returnFocus: boolean): void => {
    setIsOpen(false)
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true })
  }, [])

  function open(): void {
    if (disabled) return
    const selectedIndex = filteredOptions.findIndex((option) => selectedValues.includes(option.value))
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(filteredOptions))
    if (triggerRef.current) setFieldLabel(fieldLabelOf(triggerRef.current))
    setIsOpen(true)
  }

  // Posição da lista no computador: recalcula ao rolar (inclusive dentro do modal) e ao redimensionar.
  useLayoutEffect(() => {
    if (!isOpen || isMobile) return
    function measure(): void {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPlacement(popoverPlacement(rect, { width: window.innerWidth, height: window.innerHeight }))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [isOpen, isMobile])

  // Clique fora fecha (o painel está num portal, então conta como "dentro" também).
  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target) ||
        sheetRootRef.current?.contains(target)
      ) {
        return
      }
      close(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen, close])

  // Esc fecha só a lista, sem fechar o modal em volta (que escuta no document).
  useEffect(() => {
    if (!isOpen) return
    function handleEscape(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      close(true)
    }
    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [isOpen, close])

  // Folha do celular trava a rolagem da página por baixo.
  useEffect(() => {
    if (!isOpen || !isMobile) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen, isMobile])

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
      setPlacement(null)
    }
  }, [isOpen])

  // Foco vai para a lista assim que ela aparece (no computador, só depois de medir a posição).
  const panelVisible = isOpen && (isMobile || placement !== null)
  useEffect(() => {
    if (!panelVisible) return
    // No celular não abre o teclado sozinho: a lista inteira já cabe na folha.
    if (searchable && !isMobile) searchInputRef.current?.focus({ preventScroll: true })
    else panelRef.current?.focus({ preventScroll: true })
  }, [panelVisible, searchable, isMobile])

  useEffect(() => {
    if (isOpen) setHighlightedIndex(firstEnabledIndex(filteredOptions))
    // Só quando o texto da busca muda; abrir já escolhe a opção marcada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm])

  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) return
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlightedIndex}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, isOpen, placement])

  function handleSelect(option: SelectOption<TValue>): void {
    if (option.disabled) return
    if (props.multiple) {
      const isSelected = selectedValues.includes(option.value)
      props.onChange(
        isSelected ? selectedValues.filter((current) => current !== option.value) : [...selectedValues, option.value],
      )
      return
    }
    props.onChange(option.value)
    close(true)
  }

  function handleListKeyDown(event: React.KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlightedIndex((current) => nextEnabledIndex(filteredOptions, current, 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        setHighlightedIndex((current) => nextEnabledIndex(filteredOptions, current, -1))
        return
      case 'Home':
        event.preventDefault()
        setHighlightedIndex(firstEnabledIndex(filteredOptions))
        return
      case 'End':
        event.preventDefault()
        setHighlightedIndex(lastEnabledIndex(filteredOptions))
        return
      case 'Enter': {
        event.preventDefault()
        const option = filteredOptions[highlightedIndex]
        if (option) handleSelect(option)
        return
      }
      case 'Tab':
        close(false)
        return
      case ' ':
        if (searchable) return
        event.preventDefault()
        {
          const option = filteredOptions[highlightedIndex]
          if (option) handleSelect(option)
        }
        return
      default:
        if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = Date.now()
          const typed = now - typedRef.current.at > TYPEAHEAD_RESET_MS ? event.key : typedRef.current.text + event.key
          typedRef.current = { text: typed, at: now }
          const startFrom = typed.length > 1 ? highlightedIndex - 1 : highlightedIndex
          setHighlightedIndex(typeaheadIndex(filteredOptions, typed, startFrom))
        }
    }
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent): void {
    if (disabled || isOpen) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }

  const activeDescendant = highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined
  const sheetTitle = title ?? ariaLabel ?? fieldLabel ?? placeholder

  const list = (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      aria-multiselectable={props.multiple || undefined}
      aria-label={sheetTitle}
      className={isMobile ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2' : 'overflow-y-auto overscroll-contain p-1.5'}
      style={!isMobile && placement ? { maxHeight: placement.maxHeight - (searchable ? 56 : 0) } : undefined}
    >
      {filteredOptions.length === 0 && (
        <li className="px-3 py-6 text-center text-sm text-gray-400">Nenhuma opção encontrada</li>
      )}
      {filteredOptions.map((option, index) => (
        <SelectOptionRow
          key={option.value}
          id={`${listboxId}-option-${index}`}
          index={index}
          option={option}
          multiple={Boolean(props.multiple)}
          selected={selectedValues.includes(option.value)}
          highlighted={index === highlightedIndex}
          large={isMobile}
          onHover={() => !option.disabled && setHighlightedIndex(index)}
          onPick={() => handleSelect(option)}
        />
      ))}
    </ul>
  )

  const search = searchable ? (
    <div className={isMobile ? 'px-4 pb-2' : 'border-b border-gray-100 p-2'}>
      <label className="relative block">
        <span className="sr-only">Buscar</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          ref={searchInputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={handleListKeyDown}
          placeholder="Buscar..."
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          className={`w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
            isMobile ? 'py-2.5 text-base' : 'py-2 text-sm'
          }`}
        />
      </label>
    </div>
  ) : null

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel ? `${ariaLabel}: ${trigger.text}` : undefined}
        aria-invalid={error ? true : undefined}
        className={`group flex w-full items-center justify-between gap-2 border bg-white text-left shadow-sm transition-[border-color,box-shadow,background-color] duration-150 motion-reduce:transition-none focus:outline-none focus-visible:border-brand-500 focus-visible:ring-4 focus-visible:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none ${
          TRIGGER_SIZE[size]
        } ${
          error
            ? 'border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500/20'
            : isOpen
              ? 'border-brand-500 ring-4 ring-brand-500/20'
              : 'border-gray-300 enabled:hover:border-gray-400'
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${trigger.isPlaceholder ? 'text-gray-400' : 'text-gray-900'}`}>
          {trigger.text}
        </span>
        <span
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-[transform,background-color,color] duration-200 motion-reduce:transition-none ${
            isOpen ? 'rotate-180 bg-brand-50 text-brand-600' : 'text-gray-400 group-enabled:group-hover:text-gray-600'
          }`}
          aria-hidden
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
        </span>
      </button>

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {isOpen &&
        createPortal(
          isMobile ? (
            <MobileSheet
              rootRef={sheetRootRef}
              panelRef={panelRef}
              title={sheetTitle}
              multiple={Boolean(props.multiple)}
              selectedCount={selectedValues.length}
              onDone={() => close(true)}
              onKeyDown={handleListKeyDown}
              activeDescendant={searchable ? undefined : activeDescendant}
            >
              {search}
              {list}
            </MobileSheet>
          ) : placement ? (
            <div
              ref={panelRef}
              tabIndex={-1}
              onKeyDown={searchable ? undefined : handleListKeyDown}
              aria-activedescendant={searchable ? undefined : activeDescendant}
              className="select-popover fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10 ring-1 ring-black/5 focus:outline-none"
              data-placement={placement.openUpward ? 'top' : 'bottom'}
              style={{
                top: placement.top,
                left: placement.left,
                width: placement.width,
                maxHeight: placement.maxHeight,
                transform: placement.openUpward ? 'translateY(-100%)' : undefined,
              }}
            >
              {search}
              {list}
            </div>
          ) : null,
          document.body,
        )}
    </div>
  )
}

// Nome do campo para o título da folha: o <label> ligado ao botão (em volta ou com htmlFor) ou o
// <label> logo acima dele, como os formulários do painel fazem.
function fieldLabelOf(trigger: HTMLButtonElement): string | null {
  const ownText = trigger.textContent ?? ''
  const linked = trigger.labels?.[0]
  if (linked) {
    const text = (linked.textContent ?? '').replace(ownText, '').trim()
    if (text) return text
  }
  const wrapper = trigger.parentElement
  const previous = wrapper?.previousElementSibling ?? wrapper?.parentElement?.previousElementSibling
  if (previous?.tagName === 'LABEL') {
    const text = (previous.textContent ?? '').trim()
    if (text) return text
  }
  return null
}

function SelectOptionRow<TValue extends string>({
  id,
  index,
  option,
  multiple,
  selected,
  highlighted,
  large,
  onHover,
  onPick,
}: {
  readonly id: string
  readonly index: number
  readonly option: SelectOption<TValue>
  readonly multiple: boolean
  readonly selected: boolean
  readonly highlighted: boolean
  readonly large: boolean
  readonly onHover: () => void
  readonly onPick: () => void
}): JSX.Element {
  return (
    <li
      id={id}
      data-index={index}
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      onPointerMove={onHover}
      onClick={onPick}
      className={`flex cursor-pointer select-none items-center gap-3 rounded-lg transition-colors duration-100 motion-reduce:transition-none ${
        large ? 'min-h-[52px] px-3 py-2.5 text-base' : 'min-h-[38px] px-2.5 py-2 text-sm'
      } ${
        option.disabled
          ? 'cursor-not-allowed text-gray-300'
          : selected
            ? `font-medium text-brand-700 ${highlighted ? 'bg-brand-100' : 'bg-brand-50'}`
            : `text-gray-700 ${highlighted ? 'bg-gray-100' : ''}`
      }`}
    >
      {multiple && (
        <span
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
            selected ? 'border-brand-500 bg-brand-500' : 'border-gray-300 bg-white'
          }`}
          aria-hidden
        >
          {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        {option.hint && (
          <span className={`block truncate text-xs font-normal ${selected ? 'text-brand-600/80' : 'text-gray-400'}`}>
            {option.hint}
          </span>
        )}
      </span>
      {!multiple && selected && <Check className="h-4 w-4 flex-shrink-0 text-brand-600" strokeWidth={2.5} aria-hidden />}
    </li>
  )
}

function MobileSheet({
  rootRef,
  panelRef,
  title,
  multiple,
  selectedCount,
  onDone,
  onKeyDown,
  activeDescendant,
  children,
}: {
  readonly rootRef: React.RefObject<HTMLDivElement>
  readonly panelRef: React.RefObject<HTMLDivElement>
  readonly title: string
  readonly multiple: boolean
  readonly selectedCount: number
  readonly onDone: () => void
  readonly onKeyDown: (event: React.KeyboardEvent) => void
  readonly activeDescendant?: string
  readonly children: ReactNode
}): JSX.Element {
  return (
    <div ref={rootRef} className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div className="select-sheet-backdrop absolute inset-0 bg-black/40" aria-hidden onClick={onDone} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        aria-activedescendant={activeDescendant}
        className="select-sheet relative flex max-h-[78vh] flex-col rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-2xl focus:outline-none"
      >
        <div className="flex justify-center pt-2.5" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-2">
          <h2 className="truncate text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onDone}
            className="min-h-[40px] flex-shrink-0 rounded-full px-3 text-sm font-semibold text-brand-600 active:bg-brand-50"
          >
            {multiple ? (selectedCount > 0 ? `Pronto (${selectedCount})` : 'Pronto') : 'Fechar'}
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
