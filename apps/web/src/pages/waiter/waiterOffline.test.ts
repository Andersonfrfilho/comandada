import { describe, expect, it } from 'bun:test'
import { ApiError } from '@/lib/api'
import { isPersistedQueryKey, isRetryableError, pruneCachedQueries } from './waiterOffline'
import { newClientId } from './waiterModel'

const HOUR = 60 * 60 * 1000

describe('cache do aparelho', () => {
  it('guarda só mesas, cardápio e contas', () => {
    expect(isPersistedQueryKey(['tables'])).toBe(true)
    expect(isPersistedQueryKey(['menu'])).toBe(true)
    expect(isPersistedQueryKey(['comanda-bill', 'c1'])).toBe(true)
    expect(isPersistedQueryKey(['comanda-bill'])).toBe(false)
    expect(isPersistedQueryKey(['waiter-customer-search', 'mari'])).toBe(false)
    expect(isPersistedQueryKey(['table-comandas', 't1'])).toBe(false)
  })

  it('descarta dado velho e mantém as 30 contas mais recentes', () => {
    const now = 100 * HOUR
    const bills = Array.from({ length: 35 }, (_, index) => ({ key: ['comanda-bill', `c${index}`], data: {}, updatedAt: now - index * 1000 }))
    const kept = pruneCachedQueries(
      [{ key: ['tables'], data: [], updatedAt: now - 13 * HOUR }, { key: ['menu'], data: {}, updatedAt: now - HOUR }, ...bills],
      now
    )
    expect(kept.some((query) => query.key[0] === 'tables')).toBe(false)
    expect(kept.some((query) => query.key[0] === 'menu')).toBe(true)
    const keptBills = kept.filter((query) => query.key[0] === 'comanda-bill')
    expect(keptBills).toHaveLength(30)
    expect(keptBills[0]?.key[1]).toBe('c0')
  })
})

describe('fila de envio', () => {
  it('tenta de novo em falha de rede e servidor fora; recusa do servidor não', () => {
    expect(isRetryableError(new ApiError('Sem conexão', 0, 'network_error'))).toBe(true)
    expect(isRetryableError(new ApiError('Erro', 503))).toBe(true)
    expect(isRetryableError(new ApiError('Muitas', 429))).toBe(true)
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isRetryableError(new ApiError('Comanda fechada', 404))).toBe(false)
    expect(isRetryableError(new ApiError('Dados inválidos', 400))).toBe(false)
  })

  it('gera id de pedido no formato UUID v4', () => {
    const id = newClientId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newClientId()).not.toBe(id)
  })
})
