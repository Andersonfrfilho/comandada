import { afterEach, describe, expect, mock, test } from 'bun:test'

import { couponsSdkApi } from './couponsSdkApi'

type Call = { readonly url: string; readonly method: string; readonly body: unknown }

const originalFetch = globalThis.fetch
const calls: Call[] = []

function mockFetch(response: () => Response): void {
  calls.length = 0
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, '')
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return response()
  }) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('couponsSdkApi', () => {
  test('lista campanhas com situação em lista separada por vírgula e devolve o corpo como a página', async () => {
    const page = { data: [{ id: 'c1' }], pagination: { total: 1, page: 1, pageSize: 20 } }
    mockFetch(() => Response.json(page))

    const result = await couponsSdkApi.listCampaigns({
      page: 1,
      pageSize: 20,
      search: 'natal',
      states: ['running', 'scheduled'],
      sort: 'name',
      order: 'asc',
    })

    expect(result).toEqual(page as never)
    expect(calls[0]?.url).toContain('/sdk/coupons/campaigns?')
    const query = new URLSearchParams(calls[0]!.url.split('?')[1])
    expect(query.get('state')).toBe('running,scheduled')
    expect(query.get('search')).toBe('natal')
    expect(query.get('sort')).toBe('name')
    expect(query.get('order')).toBe('asc')
  })

  test('usos filtram por situação (`status`) e contatos por período', async () => {
    mockFetch(() => Response.json({ data: [], pagination: { total: 0, page: 1, pageSize: 10 } }))

    await couponsSdkApi.listRedemptions!('c1', { page: 1, pageSize: 10, statuses: ['redeemed', 'released'] })
    await couponsSdkApi.listLeads!('c1', { page: 2, pageSize: 10, from: '2026-11-01T03:00:00.000Z', to: '2026-12-01T03:00:00.000Z' })

    expect(new URLSearchParams(calls[0]!.url.split('?')[1]).get('status')).toBe('redeemed,released')
    expect(calls[0]!.url).toContain('/campaigns/c1/redemptions?')
    const leadsQuery = new URLSearchParams(calls[1]!.url.split('?')[1])
    expect(leadsQuery.get('from')).toBe('2026-11-01T03:00:00.000Z')
    expect(leadsQuery.get('to')).toBe('2026-12-01T03:00:00.000Z')
  })

  test('muda a situação do código por PATCH com o corpo `{ status }`', async () => {
    mockFetch(() => Response.json({ data: { id: 'k1', status: 'disabled' } }))

    await couponsSdkApi.setCouponStatus!('c1', 'k1', 'disabled')

    expect(calls[0]).toMatchObject({ method: 'PATCH', url: '/sdk/coupons/campaigns/c1/codes/k1', body: { status: 'disabled' } })
  })

  test('exportação de códigos usa o caminho `codes` e leva o formato e os filtros', async () => {
    mockFetch(() => new Response('a,b', { headers: { 'content-type': 'text/csv' } }))

    const blob = await couponsSdkApi.exportRecords!({
      campaignId: 'c1',
      kind: 'coupons',
      format: 'csv',
      filters: { unassigned: true, order: 'desc' },
    })

    expect(blob).toBeInstanceOf(Blob)
    expect(calls[0]!.url).toContain('/sdk/coupons/campaigns/c1/codes/export?')
    const query = new URLSearchParams(calls[0]!.url.split('?')[1])
    expect(query.get('format')).toBe('csv')
    expect(query.get('unassigned')).toBe('true')
  })

  test('exportação sem filtros ainda leva o formato', async () => {
    mockFetch(() => new Response('x'))

    await couponsSdkApi.exportRecords!({ campaignId: 'c1', kind: 'leads', format: 'xlsx', filters: {} })

    expect(calls[0]!.url).toBe('/sdk/coupons/campaigns/c1/leads/export?format=xlsx')
  })

  test('excluir campanha chama DELETE', async () => {
    mockFetch(() => new Response(null, { status: 204 }))

    await couponsSdkApi.removeCampaign!('c1')

    expect(calls[0]).toMatchObject({ method: 'DELETE', url: '/sdk/coupons/campaigns/c1' })
  })
})
