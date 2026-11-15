// Regras comuns das listagens do painel: formato brasileiro, busca sem acento, ordenação e paginação
// no cliente (para listas pequenas, como produtos e gastos do mês). Listas que crescem sem limite
// (clientes, pedidos, notas) paginam no servidor e só usam o formato e os textos daqui.

export type SortDirection = 'asc' | 'desc'

export interface SortState<TField extends string> {
  readonly field: TField
  readonly direction: SortDirection
}

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 20

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const integerFormatter = new Intl.NumberFormat('pt-BR')
const textCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export function formatBRL(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0)
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0)
}

export function formatInteger(value: number): string {
  return integerFormatter.format(value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  // Data sem hora ("2026-11-14") é dia do calendário: ao meio-dia não muda de dia no fuso.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// "há 3 dias", "hoje", "ontem": para colunas de último contato.
export function formatRelativeDays(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Nunca'
  const startOfDay = (moment: Date) => new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (days <= 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 30) return `Há ${days} dias`
  const months = Math.floor(days / 30)
  if (months < 12) return months === 1 ? 'Há 1 mês' : `Há ${months} meses`
  const years = Math.floor(days / 365)
  return years <= 1 ? 'Há 1 ano' : `Há ${years} anos`
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// Todas as palavras digitadas precisam aparecer em algum dos campos, sem acento e sem caixa.
export function matchesSearch(search: string, fields: ReadonlyArray<string | null | undefined>): boolean {
  const terms = normalizeText(search).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = normalizeText(fields.filter(Boolean).join(' '))
  return terms.every((term) => haystack.includes(term))
}

export type SortValue = string | number | Date | null | undefined

function compareValues(first: SortValue, second: SortValue): number {
  if (first instanceof Date) return first.getTime() - (second instanceof Date ? second.getTime() : 0)
  if (typeof first === 'number' && typeof second === 'number') return first - second
  return textCollator.compare(String(first), String(second))
}

// Vazios ficam sempre no fim, nos dois sentidos. A ordenação é estável.
export function sortRows<TRow>(
  rows: readonly TRow[],
  accessor: (row: TRow) => SortValue,
  direction: SortDirection
): TRow[] {
  const multiplier = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: accessor(row) }))
    .sort((first, second) => {
      const firstEmpty = first.value === null || first.value === undefined || first.value === ''
      const secondEmpty = second.value === null || second.value === undefined || second.value === ''
      if (firstEmpty || secondEmpty) {
        if (firstEmpty && secondEmpty) return first.index - second.index
        return firstEmpty ? 1 : -1
      }
      return compareValues(first.value, second.value) * multiplier || first.index - second.index
    })
    .map((entry) => entry.row)
}

// Clicar na mesma coluna inverte; outra coluna começa no sentido padrão dela.
export function toggleSort<TField extends string>(
  current: SortState<TField>,
  field: TField,
  defaultDirection: SortDirection = 'asc'
): SortState<TField> {
  if (current.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { field, direction: defaultDirection }
}

export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
}

export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), totalPagesFor(total, pageSize))
}

export function paginateRows<TRow>(rows: readonly TRow[], page: number, pageSize: number): TRow[] {
  const safePage = clampPage(page, rows.length, pageSize)
  const start = (safePage - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

// "1–20 de 134"
export function describePageRange(page: number, pageSize: number, total: number): string {
  if (total === 0) return 'Nenhum resultado'
  const safePage = clampPage(page, total, pageSize)
  const first = (safePage - 1) * pageSize + 1
  const last = Math.min(total, safePage * pageSize)
  return `${formatInteger(first)}–${formatInteger(last)} de ${formatInteger(total)}`
}

// Números de página para os botões, com reticências: [1, '…', 4, 5, 6, '…', 20]
export function pageButtons(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages))
  const sorted = [...pages].sort((first, second) => first - second)
  const result: Array<number | 'gap'> = []
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1]
    if (previous !== undefined && value - previous > 1) result.push('gap')
    result.push(value)
  })
  return result
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatInteger(count)} ${count === 1 ? singular : pluralForm}`
}

export interface ListParamsConfig<TField extends string> {
  readonly sortFields: readonly TField[]
  readonly defaultSort: SortState<TField>
  readonly defaultPageSize?: number
}

export interface ListParams<TField extends string> {
  readonly page: number
  readonly pageSize: number
  readonly sort: SortState<TField>
  readonly search: string
}

// Lê página, tamanho, ordenação e busca da URL; valor estranho volta ao padrão.
export function parseListParams<TField extends string>(
  searchParams: URLSearchParams,
  config: ListParamsConfig<TField>
): ListParams<TField> {
  const defaultPageSize = config.defaultPageSize ?? DEFAULT_PAGE_SIZE
  const page = Number.parseInt(searchParams.get('page') ?? '', 10)
  const pageSize = Number.parseInt(searchParams.get('pageSize') ?? '', 10)
  const sortField = config.sortFields.find((field) => field === searchParams.get('sortBy'))
  const sortDirection = searchParams.get('sortDirection')
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE_OPTIONS.some((option) => option === pageSize) ? pageSize : defaultPageSize,
    sort: {
      field: sortField ?? config.defaultSort.field,
      direction: sortDirection === 'asc' || sortDirection === 'desc' ? sortDirection : config.defaultSort.direction,
    },
    search: searchParams.get('search') ?? '',
  }
}

// Aplica mudanças na URL. Mudar filtro, busca, ordenação ou tamanho volta para a página 1.
export function applyListParamChanges(
  previous: URLSearchParams,
  changes: Record<string, string | null>
): URLSearchParams {
  const next = new URLSearchParams(previous)
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
  }
  if (!('page' in changes)) next.delete('page')
  if (next.get('page') === '1') next.delete('page')
  return next
}
