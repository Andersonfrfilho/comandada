// Leitura dos parâmetros comuns das listagens do painel (página, tamanho, ordenação, filtros).
// Tudo que vem da query string é texto do cliente: valor desconhecido vira o padrão em vez de erro,
// para um link antigo ou digitado à mão não quebrar a tela.

export type SortDirection = 'asc' | 'desc'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export interface PageRequest {
  page: number
  pageSize: number
  offset: number
}

export interface PageResult<TItem> {
  data: TItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function parsePageRequest(
  query: { page?: string | undefined; pageSize?: string | undefined },
  defaultPageSize: number = DEFAULT_PAGE_SIZE
): PageRequest {
  const page = parsePositiveInteger(query.page) ?? 1
  const pageSize = Math.min(MAX_PAGE_SIZE, parsePositiveInteger(query.pageSize) ?? defaultPageSize)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function pickAllowed<TValue extends string>(
  value: string | undefined,
  allowed: readonly TValue[]
): TValue | undefined {
  return allowed.find((candidate) => candidate === value)
}

export function parseSortDirection(value: string | undefined): SortDirection | undefined {
  return pickAllowed(value, ['asc', 'desc'] as const)
}

// "a,b,c" → só os valores permitidos; vazio quando nada sobra.
export function parseAllowedList<TValue extends string>(
  value: string | undefined,
  allowed: readonly TValue[]
): TValue[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .map((item) => pickAllowed(item, allowed))
    .filter((item): item is TValue => item !== undefined)
}

// Aceita "2026-11-14" ou ISO completo. Data inválida é ignorada.
export function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(isDateOnly ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}` : value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

// O texto da busca entra num ILIKE: % e _ digitados pelo usuário são literais, não curingas.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value.trim())}%`
}

export function buildPageResult<TItem>(data: TItem[], total: number, request: PageRequest): PageResult<TItem> {
  return {
    data,
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: Math.ceil(total / request.pageSize),
  }
}
