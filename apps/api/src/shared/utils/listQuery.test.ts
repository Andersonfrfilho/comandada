import { describe, expect, it } from 'bun:test'

import {
  buildPageResult,
  containsPattern,
  escapeLikePattern,
  parseAllowedList,
  parseDateParam,
  parsePageRequest,
  parseSortDirection,
  pickAllowed,
} from './listQuery'

describe('parsePageRequest', () => {
  it('usa página 1 e 20 por página sem parâmetros', () => {
    expect(parsePageRequest({})).toEqual({ page: 1, pageSize: 20, offset: 0 })
  })

  it('calcula o offset a partir da página', () => {
    expect(parsePageRequest({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50, offset: 100 })
  })

  it('limita o tamanho da página a 100 e ignora valores inválidos', () => {
    expect(parsePageRequest({ pageSize: '5000' }).pageSize).toBe(100)
    expect(parsePageRequest({ page: '-2', pageSize: 'abc' })).toEqual({ page: 1, pageSize: 20, offset: 0 })
    expect(parsePageRequest({ page: '0' }).page).toBe(1)
  })

  it('aceita outro tamanho padrão', () => {
    expect(parsePageRequest({}, 50).pageSize).toBe(50)
  })
})

describe('pickAllowed e parseSortDirection', () => {
  it('só devolve valores da lista', () => {
    expect(pickAllowed('name', ['name', 'createdAt'] as const)).toBe('name')
    expect(pickAllowed('drop table', ['name'] as const)).toBeUndefined()
    expect(parseSortDirection('asc')).toBe('asc')
    expect(parseSortDirection('ASC')).toBeUndefined()
  })
})

describe('parseAllowedList', () => {
  it('separa por vírgula e descarta o que não é permitido', () => {
    expect(parseAllowedList('pending, authorized,xyz', ['pending', 'authorized'] as const)).toEqual([
      'pending',
      'authorized',
    ])
    expect(parseAllowedList(undefined, ['a'] as const)).toEqual([])
  })
})

describe('parseDateParam', () => {
  it('data sem hora vira início ou fim do dia', () => {
    expect(parseDateParam('2026-11-14')?.getHours()).toBe(0)
    const end = parseDateParam('2026-11-14', true)
    expect(end?.getHours()).toBe(23)
    expect(end?.getMinutes()).toBe(59)
  })

  it('ignora data inválida', () => {
    expect(parseDateParam('ontem')).toBeUndefined()
    expect(parseDateParam(undefined)).toBeUndefined()
  })
})

describe('escapeLikePattern', () => {
  it('trata % e _ como texto', () => {
    expect(escapeLikePattern('50%_off')).toBe('50\\%\\_off')
    expect(containsPattern('  joão ')).toBe('%joão%')
  })
})

describe('buildPageResult', () => {
  it('calcula o total de páginas', () => {
    const result = buildPageResult(['a'], 41, { page: 2, pageSize: 20, offset: 20 })
    expect(result.totalPages).toBe(3)
    expect(result.page).toBe(2)
  })
})
