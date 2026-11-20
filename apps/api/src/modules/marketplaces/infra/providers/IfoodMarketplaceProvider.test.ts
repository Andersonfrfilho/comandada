import { describe, expect, it } from 'bun:test'
import { createHmac } from 'crypto'
import { IfoodMarketplaceProvider, mapIfoodOrder, mapIfoodReview, mapIfoodSale, pickCancellationCode } from './IfoodMarketplaceProvider'

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
    await provider.requestCancellation('order-uuid', { reason: 'Acabou o salmão' })
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
    expect(provider.parseWebhook(body, JSON.parse(body.toString()))).toHaveLength(1)
    expect(provider.parseWebhook(body, { hello: 'world' })).toHaveLength(0)
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

  it('retirada não tem endereço e fica com a loja; entrega do iFood fica com a plataforma', () => {
    const takeout = mapIfoodOrder({ ...sampleOrder, orderType: 'TAKEOUT' })
    expect(takeout.deliveryAddress).toBeUndefined()
    expect(takeout.deliveredBy).toBe('merchant')
    expect(mapIfoodOrder({ ...sampleOrder, delivery: { deliveredBy: 'IFOOD' } }).deliveredBy).toBe('platform')
  })
})

describe('pickCancellationCode', () => {
  const reasons = [
    { code: '501', description: 'PROBLEMAS DE SISTEMA' },
    { code: '504', description: 'RESTAURANTE SEM MOTOBOY' },
  ]
  it('usa o primeiro da lista quando nada combina', () => {
    expect(pickCancellationCode(reasons, 'cliente desistiu')).toBe('501')
    expect(pickCancellationCode(reasons, 'sem entregador agora')).toBe('504')
    expect(pickCancellationCode([], 'qualquer')).toBeNull()
  })
})

describe('negociação do iFood (HANDSHAKE_DISPUTE)', () => {
  const event = {
    id: 'ev-hsd',
    code: 'HSD',
    kind: 'dispute_opened' as const,
    orderId: 'order-uuid',
    metadata: {
      disputeId: 'disp-1',
      action: 'CANCELLATION',
      handshakeType: 'AFTER_DELIVERY',
      message: 'Veio frio',
      expiresAt: '2026-11-20T12:05:00Z',
      timeoutAction: 'ACCEPT_CANCELLATION',
      evidences: [{ url: 'https://img.test/1.jpg' }],
      metadata: { acceptCancellationReasons: ['Item com defeito'] },
      alternatives: [
        { id: 'alt-refund', type: 'REFUND', metadata: { maxAmount: { currency: 'BRL', value: '2550' } } },
        { id: 'alt-time', type: 'ADDITIONAL_TIME', metadata: { allowedsAdditionalTimeInMinutes: [10, 20], allowedsAdditionalTimeReasons: ['HIGH_STORE_DEMAND'] } },
      ],
    },
  }

  it('lê a negociação com valores em reais', () => {
    const provider = new IfoodMarketplaceProvider(config)
    const dispute = provider.parseDispute(event)!
    expect(dispute).toMatchObject({ externalId: 'disp-1', kind: 'refund', message: 'Veio frio', reasons: ['Item com defeito'] })
    expect(dispute.alternatives).toEqual([
      { id: 'alt-refund', type: 'refund', maxAmount: 25.5, minutes: undefined, reasons: undefined },
      { id: 'alt-time', type: 'additional_time', maxAmount: undefined, minutes: [10, 20], reasons: ['HIGH_STORE_DEMAND'] },
    ])
    expect(dispute.evidenceUrls).toEqual(['https://img.test/1.jpg'])
    expect(provider.parseDisputeSettlement({ ...event, kind: 'dispute_settled', metadata: { disputeId: 'disp-1', status: 'ACCEPTED' } })).toEqual({
      disputeExternalId: 'disp-1',
      status: 'accepted',
    })
  })

  it('responde aceitando, recusando ou com contraproposta em centavos', async () => {
    const { calls, fetchFunction } = fakeFetch([tokenResponse, () => new Response(null, { status: 201 })])
    const provider = new IfoodMarketplaceProvider(config, fetchFunction)
    const dispute = provider.parseDispute(event)!
    await provider.respondDispute(dispute, { decision: 'reject', reason: 'Pedido saiu correto' })
    await provider.respondDispute(dispute, { decision: 'alternative', alternativeId: 'alt-refund', amount: 12.3 })
    await provider.respondDispute(dispute, { decision: 'alternative', alternativeId: 'alt-time', minutes: 20 })
    const sent = calls.slice(1).map((call) => [call.url.replace('https://merchant-api.ifood.com.br', ''), JSON.parse(String(call.init!.body))])
    expect(sent).toEqual([
      ['/order/v1.0/disputes/disp-1/reject', { reason: 'Pedido saiu correto' }],
      ['/order/v1.0/disputes/disp-1/alternatives/alt-refund', { type: 'REFUND', metadata: { amount: { currency: 'BRL', value: '1230' } } }],
      [
        '/order/v1.0/disputes/disp-1/alternatives/alt-time',
        { type: 'ADDITIONAL_TIME', metadata: { additionalTimeInMinutes: 20, additionalTimeReason: 'HIGH_STORE_DEMAND' } },
      ],
    ])
  })
})

describe('financeiro e avaliações do iFood', () => {
  it('venda com bruto, lançamentos e líquido', () => {
    const sale = mapIfoodSale('merchant-1', {
      id: 'order-uuid',
      shortId: '8312',
      createdAt: '2026-11-01T12:00:00Z',
      currentStatus: 'CONCLUDED',
      saleGrossValue: { bag: '60.00', deliveryFee: '7.99', serviceFee: '0.99' },
      payments: { methods: [{ method: 'CREDIT', card: { brand: 'VISA' }, liability: 'IFOOD' }] },
      billingSummary: { saleBalance: '52.10', billingEntries: [{ name: 'COMMISSION', value: '-7.20' }] },
    })
    expect(sale).toMatchObject({ grossAmount: 68.98, netAmount: 52.1, displayId: '8312' })
    expect(sale.entries).toEqual([{ label: 'Comissão', amount: -7.2 }])
  })

  it('avaliação só pode ser respondida enquanto não respondida', () => {
    const review = mapIfoodReview({ id: 'r1', score: 4, status: 'NOT_REPLIED', createdAt: '2026-11-01T12:00:00Z', comment: 'Bom' })
    expect(review).toMatchObject({ id: 'r1', score: 4, canReply: true, replies: [] })
    expect(mapIfoodReview({ id: 'r2', score: 5, status: 'REPLIED', createdAt: '2026-11-01T12:00:00Z' }).canReply).toBe(false)
  })

  it('lista e responde avaliações pela Review API v2', async () => {
    const { calls, fetchFunction } = fakeFetch([
      tokenResponse,
      (url) =>
        url.includes('/review/v2.0/merchants/merchant-1/reviews?')
          ? Response.json({ page: 1, size: 20, total: 1, pageCount: 1, reviews: [{ id: 'r1', score: 5, status: 'NOT_REPLIED', createdAt: '2026-11-01T12:00:00Z' }] })
          : undefined,
      (url) => (url.endsWith('/answers') ? new Response(null, { status: 201 }) : undefined),
    ])
    const provider = new IfoodMarketplaceProvider(config, fetchFunction)
    const page = await provider.reviews.list('merchant-1', { page: 1, pageSize: 20 })
    expect(page.reviews).toHaveLength(1)
    await provider.reviews.answer('merchant-1', 'r1', 'Obrigado pela visita!')
    expect(calls.at(-1)!.url).toBe('https://merchant-api.ifood.com.br/review/v2.0/merchants/merchant-1/reviews/r1/answers')
    expect(JSON.parse(String(calls.at(-1)!.init!.body))).toEqual({ text: 'Obrigado pela visita!' })
  })
})
