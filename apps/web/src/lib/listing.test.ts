import { describe, expect, it } from 'bun:test'

import {
  applyListParamChanges,
  clampPage,
  describePageRange,
  formatBRL,
  formatDate,
  formatRelativeDays,
  matchesSearch,
  pageButtons,
  paginateRows,
  parseListParams,
  plural,
  sortRows,
  toggleSort,
  totalPagesFor,
} from './listing'

// Intl usa espaço inseparável depois de "R$".
const normalizeSpaces = (value: string) => value.replace(/\s/g, ' ')

describe('formatBRL', () => {
  it('usa vírgula decimal e ponto de milhar', () => {
    expect(normalizeSpaces(formatBRL('1234.5'))).toBe('R$ 1.234,50')
    expect(normalizeSpaces(formatBRL(0))).toBe('R$ 0,00')
  })

  it('valor vazio ou inválido vira zero', () => {
    expect(normalizeSpaces(formatBRL(null))).toBe('R$ 0,00')
    expect(normalizeSpaces(formatBRL('abc'))).toBe('R$ 0,00')
  })
})

describe('formatDate', () => {
  it('data do calendário não muda de dia', () => {
    expect(formatDate('2026-11-01')).toBe('01/11/2026')
    expect(formatDate(null)).toBe('—')
  })
})

describe('formatRelativeDays', () => {
  const now = new Date(2026, 10, 15, 10, 0)
  it('fala hoje, ontem, dias e meses', () => {
    expect(formatRelativeDays(new Date(2026, 10, 15, 8).toISOString(), now)).toBe('Hoje')
    expect(formatRelativeDays(new Date(2026, 10, 14, 23).toISOString(), now)).toBe('Ontem')
    expect(formatRelativeDays(new Date(2026, 10, 5).toISOString(), now)).toBe('Há 10 dias')
    expect(formatRelativeDays(new Date(2026, 7, 1).toISOString(), now)).toBe('Há 3 meses')
    expect(formatRelativeDays(null, now)).toBe('Nunca')
  })
})

describe('matchesSearch', () => {
  it('ignora acento, caixa e ordem das palavras', () => {
    expect(matchesSearch('joao temaki', ['Temaki de salmão', 'João'])).toBe(true)
    expect(matchesSearch('SALMAO', ['Sashimi de salmão'])).toBe(true)
    expect(matchesSearch('atum', ['Sashimi de salmão'])).toBe(false)
    expect(matchesSearch('   ', ['qualquer'])).toBe(true)
  })
})

describe('sortRows', () => {
  const rows = [
    { name: 'Égua', value: 3 },
    { name: 'abacate', value: null },
    { name: 'Banana', value: 10 },
    { name: 'item 2', value: 1 },
    { name: 'item 10', value: 1 },
  ]

  it('ordena texto em pt-BR sem diferenciar acento e caixa, números naturais', () => {
    expect(sortRows(rows, (row) => row.name, 'asc').map((row) => row.name)).toEqual([
      'abacate',
      'Banana',
      'Égua',
      'item 2',
      'item 10',
    ])
  })

  it('deixa vazios no fim nos dois sentidos e é estável', () => {
    expect(sortRows(rows, (row) => row.value, 'desc').map((row) => row.name)).toEqual([
      'Banana',
      'Égua',
      'item 2',
      'item 10',
      'abacate',
    ])
    expect(sortRows(rows, (row) => row.value, 'asc')[4]?.name).toBe('abacate')
  })
})

describe('toggleSort', () => {
  it('inverte a mesma coluna e começa a nova no sentido padrão', () => {
    expect(toggleSort({ field: 'name', direction: 'asc' }, 'name')).toEqual({ field: 'name', direction: 'desc' })
    expect(toggleSort({ field: 'name', direction: 'asc' }, 'total', 'desc')).toEqual({
      field: 'total',
      direction: 'desc',
    })
  })
})

describe('paginação', () => {
  const items = Array.from({ length: 45 }, (_, index) => index + 1)

  it('fatia a página e corrige página fora do intervalo', () => {
    expect(paginateRows(items, 1, 20)).toHaveLength(20)
    expect(paginateRows(items, 3, 20)).toEqual([41, 42, 43, 44, 45])
    expect(paginateRows(items, 9, 20)).toEqual([41, 42, 43, 44, 45])
    expect(clampPage(0, 45, 20)).toBe(1)
    expect(totalPagesFor(0, 20)).toBe(1)
  })

  it('descreve o intervalo mostrado', () => {
    expect(describePageRange(2, 20, 1340)).toBe('21–40 de 1.340')
    expect(describePageRange(1, 20, 0)).toBe('Nenhum resultado')
  })

  it('mostra os botões de página com reticências', () => {
    expect(pageButtons(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageButtons(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20])
    expect(pageButtons(1, 20)).toEqual([1, 2, 'gap', 20])
  })

  it('plural em português', () => {
    expect(plural(1, 'cliente', 'clientes')).toBe('1 cliente')
    expect(plural(1200, 'cliente', 'clientes')).toBe('1.200 clientes')
  })
})

describe('parseListParams e applyListParamChanges', () => {
  const config = {
    sortFields: ['name', 'createdAt'] as const,
    defaultSort: { field: 'createdAt' as const, direction: 'desc' as const },
  }

  it('lê a URL e usa padrões para valores estranhos', () => {
    expect(parseListParams(new URLSearchParams('page=3&pageSize=50&sortBy=name&sortDirection=asc&search=ana'), config)).toEqual({
      page: 3,
      pageSize: 50,
      sort: { field: 'name', direction: 'asc' },
      search: 'ana',
    })
    expect(parseListParams(new URLSearchParams('page=-1&pageSize=7&sortBy=senha&sortDirection=x'), config)).toEqual({
      page: 1,
      pageSize: 20,
      sort: { field: 'createdAt', direction: 'desc' },
      search: '',
    })
  })

  it('volta para a página 1 quando muda filtro e mantém o resto', () => {
    const next = applyListParamChanges(new URLSearchParams('page=4&sortBy=name&segment=inactive'), { segment: null })
    expect(next.toString()).toBe('sortBy=name')
    const paged = applyListParamChanges(new URLSearchParams('sortBy=name'), { page: '2' })
    expect(paged.toString()).toBe('sortBy=name&page=2')
    expect(applyListParamChanges(paged, { page: '1' }).toString()).toBe('sortBy=name')
  })
})
