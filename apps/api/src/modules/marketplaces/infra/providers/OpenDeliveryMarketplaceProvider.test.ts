import { describe, expect, it } from 'bun:test'
import { createHmac } from 'crypto'
import { OpenDeliveryMarketplaceProvider, mapOpenDeliveryOrder, openDeliveryCancellationCode } from './OpenDeliveryMarketplaceProvider'

const config = {
  platform: '99food' as const,
  baseUrl: 'https://api.99food.test/opendelivery/',
  clientId: 'client',
  clientSecret: 'secret',
  merchantIds: ['loja-1'],
}

function recorder() {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetchFunction = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init })
    if (url.endsWith('/oauth/token') || url.endsWith('/token')) return Response.json({ access_token: 'od-token', expires_in: 3600 })
    if (url.includes('events:polling'))
      return Response.json([{ eventId: 'e1', eventType: 'CREATED', orderId: 'o1', createdAt: '2026-11-20T12:00:00Z' }])
    return new Response(null, { status: 202 })
  }
  return { calls, fetchFunction }
}

describe('OpenDeliveryMarketplaceProvider (99Food)', () => {
  it('token, polling e acknowledgment no padrão Open Delivery', async () => {
    const { calls, fetchFunction } = recorder()
    const provider = new OpenDeliveryMarketplaceProvider(config, fetchFunction)
    const events = await provider.pollEvents()
    await provider.acknowledge(events)

    expect(events[0]).toMatchObject({ id: 'e1', code: 'CREATED', kind: 'placed', orderId: 'o1' })
    expect(calls[0]!.url).toBe('https://api.99food.test/opendelivery/oauth/token')
    expect(String(calls[0]!.init!.body)).toContain('grant_type=client_credentials')
    expect(calls[1]!.url).toBe('https://api.99food.test/opendelivery/v1/events:polling')
    expect((calls[1]!.init!.headers as Record<string, string>)['x-polling-merchants']).toBe('loja-1')
    expect(calls[2]!.url).toBe('https://api.99food.test/opendelivery/v1/events/acknowledgment')
    expect(JSON.parse(String(calls[2]!.init!.body))).toEqual([{ id: 'e1', orderId: 'o1', eventType: 'CREATED' }])
  })

  it('ações e cancelamento com código do padrão', async () => {
    const { calls, fetchFunction } = recorder()
    const provider = new OpenDeliveryMarketplaceProvider({ ...config, tokenUrl: 'https://auth.99food.test/token' }, fetchFunction)
    await provider.sendAction('o1', 'startPreparation')
    await provider.sendAction('o1', 'delivered')
    await provider.requestCancellation('o1', { reason: 'Item acabou' })
    expect(calls[0]!.url).toBe('https://auth.99food.test/token')
    expect(calls.slice(1).map((call) => call.url.replace('https://api.99food.test/opendelivery', ''))).toEqual([
      '/v1/orders/o1/preparing',
      '/v1/orders/o1/delivered',
      '/v1/orders/o1/requestCancellation',
    ])
    expect(JSON.parse(String(calls[3]!.init!.body))).toEqual({ reason: 'Item acabou', code: 'UNAVAILABLE_ITEM', mode: 'MANUAL' })
  })

  it('assinatura do webhook em hex ou base64', () => {
    const provider = new OpenDeliveryMarketplaceProvider(config)
    const body = Buffer.from('{"eventId":"e1","eventType":"CREATED","orderId":"o1"}')
    const digest = createHmac('sha256', 'secret').update(body).digest()
    expect(provider.verifyWebhook(body, { 'x-app-signature': digest.toString('hex') })).toBe(true)
    expect(provider.verifyWebhook(body, { 'x-app-signature': digest.toString('base64') })).toBe(true)
    expect(provider.verifyWebhook(body, { 'x-app-signature': 'errada' })).toBe(false)
  })

  it('código de cancelamento padrão quando o motivo não combina', () => {
    expect(openDeliveryCancellationCode('cliente ligou')).toBe('INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT')
    expect(openDeliveryCancellationCode('fora da área')).toBe('ORDER_OUTSIDE_THE_DELIVERY_AREA')
  })
})

describe('mapOpenDeliveryOrder', () => {
  it('lê valores em { value } e soma a taxa de entrega dos otherFees', () => {
    const order = mapOpenDeliveryOrder('99food', {
      id: 'o1',
      displayId: '4421',
      type: 'DELIVERY',
      customer: { name: 'João', phone: { number: '62999990000' } },
      items: [
        {
          name: 'Temaki salmão',
          externalCode: 'TMK',
          quantity: 3,
          unitPrice: { value: 20, currency: 'BRL' },
          totalPrice: { value: 63, currency: 'BRL' },
          specialInstructions: 'bem gelado',
          options: [{ name: 'Gergelim', quantity: 1, unitPrice: { value: 1 } }],
        },
      ],
      otherFees: [
        { type: 'DELIVERY_FEE', price: { value: 6.5 } },
        { type: 'SERVICE_FEE', price: { value: 0.99 } },
      ],
      total: { discount: { value: 4 }, orderAmount: { value: 66.49 } },
      payments: { methods: [{ value: 66.49, type: 'PREPAID', method: 'PIX' }] },
      delivery: { deliveredBy: 'MARKETPLACE', deliveryAddress: { street: 'Av. T-63', number: '100', district: 'Setor Bueno', city: 'Goiânia' } },
    })
    expect(order).toMatchObject({
      platform: '99food',
      displayId: '4421',
      type: 'delivery',
      deliveryFee: 6.5,
      discount: 4,
      orderAmount: 66.49,
      deliveredBy: 'platform',
      deliveryAddress: { formatted: 'Av. T-63, 100 - Setor Bueno - Goiânia' },
      payments: [{ method: 'Pix', prepaid: true, amount: 66.49 }],
    })
    expect(order.items[0]).toMatchObject({ unitPrice: 21, quantity: 3, notes: 'bem gelado' })
  })
})
