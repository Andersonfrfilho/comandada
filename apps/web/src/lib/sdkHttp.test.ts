import { afterEach, describe, expect, mock, test } from 'bun:test'

import { ApiError, api } from './api'
import { buildQuery } from './sdkHttp'

describe('buildQuery', () => {
  test('ignora valores ausentes e mantém falso e zero', () => {
    expect(buildQuery({ page: 1, belowMinimum: false, search: undefined, offset: 0 })).toBe(
      '?page=1&belowMinimum=false&offset=0'
    )
  })

  test('sem parâmetros não gera interrogação', () => {
    expect(buildQuery({ search: undefined })).toBe('')
  })
})

describe('erro no envelope dos módulos do SDK', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('guarda o código e a mensagem de `{ error: { code, message } }`', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ error: { code: 'STOCK_DISABLED', message: 'Estoque desligado.' } }, { status: 404 })
    ) as unknown as typeof fetch

    const error = await api.get('/sdk/stock/levels').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('STOCK_DISABLED')
    expect((error as ApiError).message).toBe('Estoque desligado.')
    expect((error as ApiError).status).toBe(404)
  })

  test('mantém o formato das rotas do painel (`error` em texto)', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ error: 'forbidden', message: 'Sem permissão.' }, { status: 403 })
    ) as unknown as typeof fetch

    const error = await api.get('/catalog/products').catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('forbidden')
    expect((error as ApiError).message).toBe('Sem permissão.')
  })
})
