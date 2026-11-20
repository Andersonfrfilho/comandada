import { describe, expect, it } from 'bun:test'
import { createHmac } from 'crypto'
import { IfoodMarketplaceProvider, mapIfoodOrder, pickCancellationCode } from './IfoodMarketplaceProvider'

interface Call {
  url: string
  init: RequestInit | undefined
}

function fakeFetch(responses: Array<(url: string) => Response | undefined>) {
  const calls: Call[] = []
  const fetchFunction = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init })
    for (const respond of responses) {
      const response = respond(url)
      if (response) return response
    }
    return new Response('not found', { status: 404 })
  }
  return { calls, fetchFunction }
}

const tokenResponse = (url: string) =>
  url.endsWith('/oauth/token') ? Response.json({ accessToken: 'token-1', expiresIn: 21600 }) : undefined

const config = { clientId: 'client', clientSecret: 'secret', merchantIds: ['merchant-1', 'merchant-2'] }

const sampleOrder = {
  id: 'order-uuid',
  displayId: '8312',
  orderType: 'DELIVERY' as const,
  orderTiming: 'IMMEDIATE' as const,
  merchant: { id: 'merchant-1' },
  customer: { name: 'Maria', phone: { number: '0800 123 4567', localizer: '12345678' } },
  items: [
    {
      name: 'Hot Roll',
      externalCode: 'HR10',
      quantity: 2,
      unitPrice: 25,
      optionsPrice: 3,
      totalPrice: 56,
      observations: 'sem cebolinha',
      options: [{ name: 'Cream cheese extra', quantity: 1, unitPrice: 3 }],
    },
  ],
  total: { subTotal: 56, deliveryFee: 7.99, benefits: 5, orderAmount: 58.99 },
  payments: {
    prepaid: 0,
    pending: 58.99,
    methods: [{ value: 58.99, method: 'CASH', type: 'OFFLINE' as const, cash: { changeFor: 100 } }],
  },
  delivery: {
    deliveredBy: 'MERCHANT' as const,
    deliveryAddress: {
      formattedAddress: 'Rua das Flores, 10',
      neighborhood: 'Centro',
      city: 'Goiânia',
      complement: 'Apto 2',
      reference: 'Perto da praça',
    },
  },
}

describe('IfoodMarketplaceProvider', () => {
  it('pede token com client_credentials e faz polling com as lojas no header', async () => {
    const { calls, fetchFunction } = fakeFetch([
      tokenResponse,
      (url) =>
        url.includes('events:polling')
          ? Response.json([{ id: 'event-1', code: 'PLC', fullCode: 'PLACED', orderId: 'order-uuid', merchantId: 'merchant-1' }])
          : undefined,
    ])
    const provider = new IfoodMarketplaceProvider(config, fetchFunction)

    const events = await provider.pollEvents()

    expect(events).toEqual([
      { id: 'event-1', code: 'PLACED', kind: 'placed', orderId: 'order-uuid', merchantId: 'merchant-1', createdAt: undefined },
    ])
    const tokenBody = String(calls[0]!.init!.body)
    expect(calls[0]!.url).toBe('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token')
    expect(tokenBody).toContain('grantType=client_credentials')
    expect(tokenBody).toContain('clientId=client')
    const pollHeaders = calls[1]!.init!.headers as Record<string, string>
    expect(calls[1]!.url).toBe('https://merchant-api.ifood.com.br/events/v1.0/events:polling')
    expect(pollHeaders['x-polling-merchants']).toBe('merchant-1,merchant-2')
    expect(pollHeaders['Authorization']).toBe('Bearer token-1')
  })

  it('204 no polling é lista vazia e o token é reaproveitado', async () => {
    const { calls, fetchFunction } = fakeFetch([
      tokenResponse,
      (url) => (url.includes('events:polling') ? new Response(null, { status: 204 }) : undefined),
    ])
    const provider = new IfoodMarketplaceProvider(config, fetchFunction)
    expect(await provider.pollEvents()).toEqual([])
    expect(await provider.pollEvents()).toEqual([])
    expect(calls.filter((call) => call.url.endsWith('/oauth/token'))).toHaveLength(1)
  })

  it('confirma o recebimento dos eventos pelo id', async () => {
    const { calls, fetchFunction } = fakeFetch([
      tokenResponse,
      (url) => (url.endsWith('/events/acknowledgment') ? new Response(null, { status: 202 }) : undefined),
    ])
    const provider = new IfoodMarketplaceProvider(config, fetchFunction)
    await provider.acknowledge([{ id: 'event-1', code: 'PLACED', kind: 'placed', orderId: 'order-uuid' }])
    expect(JSON.parse(String(calls[1]!.init!.body))).toEqual([{ id: 'event-1' }])
  })

  it('manda as ações do pedido para os caminhos do iFood e ignora "entregue"', async () => {
    const { calls, fetchFunction } = fakeFetch([tokenResponse, () => new Response(null, { status: 202 })])
    const provider = new IfoodMarketplaceProvider(config, fetchFunction)
    await provider.sendAction('order-uuid', 'confirm')
    await provider.sendAction('order-uuid', 'startPreparation')
    await provider.sendAction('order-uuid', 'readyForPickup')
    await provider.sendAction('order-uuid', 'dispatch')
    await provider.sendAction('order-uuid', 'delivered')
    expect(calls.slice(1).map((call) => call.url.replace('https://merchant-api.ifood.com.br', ''))).toEqual([
      '/order/v1.0/orders/order-uuid/confirm',
      '/order/v1.0/orders/order-uuid/startPreparation',
      '/order/v1.0/orders/order-uuid/readyToPickup',
      '/order/v1.0/orders/order-uuid/dispatch',
    ])
  })

  it('cancela com o código da lista do pedido que combina com o motivo', async () => {
    const { calls, fetchFunction } = fakeFetch([
      tokenResponse,
      (url) =>
        url.endsWith('/cancellationReasons')
          ? Response.json([
              { cancelCodeId: '501', description: 'PROBLEMAS DE SISTEMA' },
              { cancelCodeId: '503', description: 'ITEM INDISPONIVEL' },
            ])
          : undefined,
      (url) => (url.endsWith('/requestCancellation') ? new Response(null, { status: 202 }) : undefined),
    ])
    const provider = new IfoodMarketplaceProvider(config, fetchFunction)
    await provider.requestCancellation('order-uuid', 'Acabou o salmão')
    expect(JSON.parse(String(calls[2]!.init!.body))).toEqual({ reason: 'Acabou o salmão', cancellationCode: '503' })
  })

  it('erro da API vira exceção com o status', async () => {
    const { fetchFunction } = fakeFetch([tokenResponse, () => new Response('boom', { status: 500 })])
    const provider = new IfoodMarketplaceProvider(config, fetchFunction)
    await expect(provider.getOrder('order-uuid')).rejects.toThrow('500')
  })

  it('renova o token quando a API responde 401', async () => {
    let tokenCount = 0
    let orderCalls = 0
    const fetchFunction = async (url: string): Promise<Response> => {
      if (url.endsWith('/oauth/token')) {
        tokenCount += 1
        return Response.json({ accessToken: `token-${tokenCount}`, expiresIn: 21600 })
      }
      orderCalls += 1
      return orderCalls === 1 ? new Response('expired', { status: 401 }) : Response.json(sampleOrder)
    }
    const provider = new IfoodMarketplaceProvider(config, fetchFunction)
    const order = await provider.getOrder('order-uuid')
    expect(order.displayId).toBe('8312')
    expect(tokenCount).toBe(2)
  })

  it('confere a assinatura do webhook (HMAC-SHA256 do corpo com o client secret)', () => {
    const provider = new IfoodMarketplaceProvider(config)
    const body = Buffer.from(JSON.stringify({ id: 'event-1', code: 'PLC', orderId: 'order-uuid' }))
    const signature = createHmac('sha256', 'secret').update(body).digest('hex')
    expect(provider.verifyWebhook(body, { 'x-ifood-signature': signature })).toBe(true)
    expect(provider.verifyWebhook(body, { 'x-ifood-signature': 'a'.repeat(64) })).toBe(false)
    expect(provider.verifyWebhook(body, {})).toBe(false)
    expect(provider.parseWebhook(JSON.parse(body.toString()))).toHaveLength(1)
    expect(provider.parseWebhook({ hello: 'world' })).toHaveLength(0)
  })
})

describe('mapIfoodOrder', () => {
  it('traduz o pedido do iFood para o formato comum', () => {
    const order = mapIfoodOrder(sampleOrder)
    expect(order).toMatchObject({
      platform: 'ifood',
      externalId: 'order-uuid',
      displayId: '8312',
      type: 'delivery',
      customerName: 'Maria',
      customerPhone: '0800 123 4567 (código 12345678)',
      deliveryFee: 7.99,
      discount: 5,
      orderAmount: 58.99,
      deliveredBy: 'merchant',
      deliveryAddress: { formatted: 'Rua das Flores, 10', complement: 'Apto 2', reference: 'Perto da praça' },
      payments: [{ method: 'Dinheiro', prepaid: false, amount: 58.99, changeFor: 100 }],
    })
    // Preço da unidade com o adicional: 56 / 2.
    expect(order.items[0]).toMatchObject({ name: 'Hot Roll', externalCode: 'HR10', quantity: 2, unitPrice: 28, notes: 'sem cebolinha' })
  })

  it('retirada não tem endereço e entrega do iFood fica com a plataforma', () => {
    expect(mapIfoodOrder({ ...sampleOrder, orderType: 'TAKEOUT' }).deliveryAddress).toBeUndefined()
    expect(mapIfoodOrder({ ...sampleOrder, delivery: { deliveredBy: 'IFOOD' } }).deliveredBy).toBe('platform')
  })
})

describe('pickCancellationCode', () => {
  const reasons = [
    { cancelCodeId: '501', description: 'PROBLEMAS DE SISTEMA' },
    { cancelCodeId: '504', description: 'RESTAURANTE SEM MOTOBOY' },
  ]
  it('usa o primeiro da lista quando nada combina', () => {
    expect(pickCancellationCode(reasons, 'cliente desistiu')).toBe('501')
    expect(pickCancellationCode(reasons, 'sem entregador agora')).toBe('504')
    expect(pickCancellationCode([], 'qualquer')).toBeNull()
  })
})
