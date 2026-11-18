import { describe, expect, it } from 'bun:test'
import type { BotSharedContext } from '@/modules/bot/application/use-cases/GetBotContextUseCase'
import type { CreateBotOrderParams } from '@/modules/bot/application/use-cases/CreateBotOrderUseCase'
import type { DeliveryFeeQuote } from '@/modules/delivery/application/use-cases/CalculateDeliveryFeeUseCase'
import { StorefrontService, type StorefrontCustomer, type StorefrontRepository } from './StorefrontService'
import { groupStorefrontMenu, storefrontPaymentMethods } from './storefrontMenu'
import {
  isOpenAt,
  isValidTrackingToken,
  normalizeBrazilianPhone,
  openingHoursFrom,
  orderTrackingToken,
  phoneVariants,
  storefrontOrderCode,
} from '../shared/storefront.constant'

const ESTABLISHMENT_ID = '11111111-1111-4111-8111-111111111111'
const COMBO_ID = '22222222-2222-4222-8222-222222222222'
const TEMAKI_M = '33333333-3333-4333-8333-333333333333'
const TEMAKI_G = '44444444-4444-4444-8444-444444444444'
const SECRET = 'segredo-de-teste'
// Quarta-feira, 20h em São Paulo (23h UTC).
const OPEN_NOW = new Date('2026-11-18T23:00:00Z')
// Quarta-feira, 10h em São Paulo.
const CLOSED_NOW = new Date('2026-11-18T13:00:00Z')

function sharedContext(overrides: Partial<BotSharedContext> = {}): BotSharedContext {
  return {
    establishment: { id: ESTABLISHMENT_ID, name: 'Yuyaki', whatsappNumber: '5516999990000', settings: {} },
    config: { opening_time: '18:00', closing_time: '23:30', working_days: 'ter,qua,qui,sex,sab,dom', min_order_value: '30', brand_name: 'Yuyaki Sushi Bar' },
    products: [
      { id: COMBO_ID, name: 'Combo tradicional', price: 89.9, description: '32 unidades', category: 'Combos', variant_group: null, variant_label: null },
      { id: TEMAKI_G, name: 'Temaki salmão G', price: 32, description: null, category: 'Temakis', variant_group: 'Temaki salmão', variant_label: 'Grande' },
      { id: TEMAKI_M, name: 'Temaki salmão M', price: 25, description: 'Salmão e cream cheese', category: 'Temakis', variant_group: 'Temaki salmão', variant_label: 'Médio' },
    ],
    paymentTypes: [
      { id: 1, name: 'pix', type: 'digital', label: 'PIX', config: { chave: 'pix@yuyaki.com', nome: 'Yuyaki' } },
      { id: 2, name: 'cartao', type: 'card', label: 'Cartão', config: {} },
      { id: 3, name: 'dinheiro', type: 'cash', label: 'Dinheiro', config: {} },
    ],
    orderTypes: [
      { id: 1, name: 'delivery', type: 'home_delivery', label: 'Entregar' },
      { id: 2, name: 'retirada', type: 'pickup', label: 'Retirada' },
    ],
    tables: [],
    deliveryFeeRule: { id: 1, mode: 'per_km', baseFee: 5, perKmRate: 1.5, perMinRate: 0, freeAbove: 150, maxRadiusKm: 8, zones: [] },
    coordinates: null,
    ...overrides,
  }
}

interface Harness {
  service: StorefrontService
  createdOrders: CreateBotOrderParams[]
  quotedAddresses: string[]
}

function buildService(options: {
  context?: BotSharedContext
  customer?: StorefrontCustomer | null
  savedAddress?: string | null
  lastPayment?: string | null
  quote?: Partial<DeliveryFeeQuote>
  now?: Date
} = {}): Harness {
  const createdOrders: CreateBotOrderParams[] = []
  const quotedAddresses: string[] = []
  const repository: StorefrontRepository = {
    findEstablishment: async () => ({ id: ESTABLISHMENT_ID, whatsappNumber: '5516999990000' }),
    findCustomerByPhones: async () => options.customer ?? null,
    lastDeliveryAddress: async () => options.savedAddress ?? null,
    lastPaymentMethod: async () => options.lastPayment ?? null,
    findOrderForTracking: async (orderId) => ({
      id: orderId,
      establishmentId: ESTABLISHMENT_ID,
      number: 42,
      code: 'WEB-1',
      status: 'received',
      paymentStatus: 'not_required',
      type: 'pickup',
      totalAmount: 89.9,
      deliveryFee: 0,
      estimatedAt: null,
      createdAt: OPEN_NOW,
      items: [{ name: 'Combo tradicional', quantity: 1, unitPrice: 89.9, notes: null }],
      charge: null,
      paymentMethods: ['pix'],
    }),
  }
  const service = new StorefrontService(
    repository,
    { sharedContext: async () => options.context ?? sharedContext() },
    {
      quote: async ({ address }) => {
        quotedAddresses.push(address)
        return { feeAmount: 7.5, distanceKm: 1.7, ruleConfigured: true, freeShipping: false, outOfRange: false, maxRadiusKm: 8, freeAbove: 150, ...options.quote }
      },
    },
    {
      execute: async (params) => {
        createdOrders.push(params)
        return { id: '55555555-5555-4555-8555-555555555555', code: params.code, number: 42, estimatedAt: '2026-11-18T23:45:00.000Z' }
      },
    },
    SECRET,
    () => options.now ?? OPEN_NOW
  )
  return { service, createdOrders, quotedAddresses }
}

const BASE_ORDER = {
  establishmentId: ESTABLISHMENT_ID,
  phone: '(16) 98888-1234',
  name: 'Maria',
  orderType: 'retirada' as const,
  items: [{ productId: COMBO_ID, quantity: 1 }],
  paymentMethod: 'cartao',
}

describe('cardápio online: regras compartilhadas', () => {
  it('junta os tamanhos do mesmo item num card, do mais barato ao mais caro', () => {
    const categories = groupStorefrontMenu(sharedContext().products)
    expect(categories.map((category) => category.name)).toEqual(['Combos', 'Temakis'])
    const temaki = categories[1]!.items[0]!
    expect(temaki.name).toBe('Temaki salmão')
    expect(temaki.description).toBe('Salmão e cream cheese')
    expect(temaki.options.map((option) => option.label)).toEqual(['Médio', 'Grande'])
  })

  it('mostra a chave Pix só quando o Pix não é cobrado online', () => {
    const offline = storefrontPaymentMethods(sharedContext().paymentTypes)
    expect(offline[0]).toMatchObject({ kind: 'pix', pixKey: 'pix@yuyaki.com' })
    const online = storefrontPaymentMethods([{ id: 1, name: 'pix', type: 'digital', label: 'PIX', config: { online: 'true', chave: 'x' } }])
    expect(online[0]).toMatchObject({ kind: 'pix_online', pixKey: null })
  })

  it('segue o horário do bot em São Paulo', () => {
    const hours = openingHoursFrom({}, { opening_time: '18:00', closing_time: '23:00', working_days: 'qua' })
    expect(isOpenAt(hours, OPEN_NOW)).toBe(true)
    expect(isOpenAt(hours, CLOSED_NOW)).toBe(false)
    expect(isOpenAt({ ...hours, ignoreHours: true }, CLOSED_NOW)).toBe(true)
    expect(isOpenAt({ ...hours, workingDays: ['qui'] }, OPEN_NOW)).toBe(false)
  })

  it('normaliza o WhatsApp e procura com e sem o nono dígito', () => {
    expect(normalizeBrazilianPhone('(16) 98888-1234')).toBe('5516988881234')
    expect(normalizeBrazilianPhone('+55 16 98888-1234')).toBe('5516988881234')
    expect(normalizeBrazilianPhone('1234')).toBeNull()
    expect(phoneVariants('5516988881234')).toEqual(['5516988881234', '551688881234'])
    expect(phoneVariants('551688881234')).toEqual(['551688881234', '5516988881234'])
    expect(phoneVariants('551633221100')).toEqual(['551633221100'])
  })

  it('assina o acompanhamento do pedido', () => {
    const token = orderTrackingToken('pedido-1', SECRET)
    expect(isValidTrackingToken('pedido-1', token, SECRET)).toBe(true)
    expect(isValidTrackingToken('pedido-2', token, SECRET)).toBe(false)
    expect(isValidTrackingToken('pedido-1', 'curto', SECRET)).toBe(false)
  })

  it('gera o código no molde do bot, com a hora de São Paulo', () => {
    expect(storefrontOrderCode('5516988881234', OPEN_NOW)).toBe('WEB-20261118200000-1234')
  })
})

describe('StorefrontService', () => {
  it('monta o cardápio com marca, horário, pedido mínimo e formas de receber', async () => {
    const { service } = buildService()
    const menu = await service.menu({})
    expect(menu.establishment).toMatchObject({ name: 'Yuyaki Sushi Bar', isOpen: true, minOrderValue: 30 })
    expect(menu.orderTypes).toEqual(['delivery', 'retirada'])
    expect(menu.delivery).toEqual({ baseFee: 5, freeAbove: 150, maxRadiusKm: 8, byDistance: true })
  })

  it('não conta nome nem endereço de quem digita um telefone', async () => {
    const { service } = buildService({
      customer: { id: 'c1', name: 'Maria', whatsappNumber: '551688881234' },
      savedAddress: 'Rua A, 10, ap 2',
      lastPayment: 'pix',
    })
    const lookup = await service.lookupCustomer({ establishmentId: ESTABLISHMENT_ID, phone: '16 98888-1234' })
    expect(lookup).toEqual({ known: true, hasSavedAddress: true, lastPaymentMethod: 'pix' })
    expect(JSON.stringify(lookup)).not.toContain('Rua A')
    expect(JSON.stringify(lookup)).not.toContain('Maria')
  })

  it('grava pelo caso de uso do bot com canal web e taxa calculada na API', async () => {
    const { service, createdOrders, quotedAddresses } = buildService()
    const result = await service.placeOrder({
      ...BASE_ORDER,
      orderType: 'delivery',
      address: 'Rua das Flores, 123 - Centro, Franca',
      complement: 'ap 12',
      paymentMethod: 'dinheiro',
      changeFor: 100,
      notes: 'sem cebolinha',
    })
    expect(quotedAddresses).toEqual(['Rua das Flores, 123 - Centro, Franca'])
    expect(createdOrders[0]).toMatchObject({
      channel: 'web',
      orderType: 'delivery',
      whatsappNumber: '5516988881234',
      customerName: 'Maria',
      deliveryFee: 7.5,
      complement: 'ap 12',
      changeFor: 100,
      notes: 'sem cebolinha',
    })
    expect(createdOrders[0]!.code.startsWith('WEB-')).toBe(true)
    expect(isValidTrackingToken(result.orderId, result.trackingToken, SECRET)).toBe(true)
  })

  it('reaproveita o endereço da última entrega sem que ele passe pelo navegador', async () => {
    const { service, createdOrders } = buildService({
      customer: { id: 'c1', name: 'Maria Souza', whatsappNumber: '551688881234' },
      savedAddress: 'Rua A, 10, ap 2',
    })
    await service.placeOrder({ ...BASE_ORDER, orderType: 'delivery', useSavedAddress: true, name: 'Outro nome' })
    expect(createdOrders[0]).toMatchObject({ address: 'Rua A, 10, ap 2', whatsappNumber: '551688881234' })
    // Nome do cadastro não é trocado por quem só digitou o telefone.
    expect(createdOrders[0]!.customerName).toBeUndefined()
  })

  it('recusa fora do horário, abaixo do mínimo, fora da área e troco menor que o total', async () => {
    await expect(buildService({ now: CLOSED_NOW }).service.placeOrder(BASE_ORDER)).rejects.toThrow('fechados')
    await expect(
      buildService().service.placeOrder({ ...BASE_ORDER, items: [{ productId: TEMAKI_M, quantity: 1 }] })
    ).rejects.toThrow('pedido mínimo')
    await expect(
      buildService({ quote: { outOfRange: true } }).service.placeOrder({ ...BASE_ORDER, orderType: 'delivery', address: 'Longe, 1' })
    ).rejects.toThrow('fora da nossa área')
    await expect(
      buildService().service.placeOrder({ ...BASE_ORDER, paymentMethod: 'dinheiro', changeFor: 50 })
    ).rejects.toThrow('troco')
    await expect(buildService().service.placeOrder({ ...BASE_ORDER, paymentMethod: 'cheque' })).rejects.toThrow('pagamento')
  })

  it('calcula a taxa pelo endereço salvo sem devolvê-lo', async () => {
    const { service, quotedAddresses } = buildService({
      customer: { id: 'c1', name: 'Maria', whatsappNumber: '5516988881234' },
      savedAddress: 'Rua A, 10, ap 2',
    })
    const quote = await service.quoteDelivery({ establishmentId: ESTABLISHMENT_ID, phone: '16988881234', useSavedAddress: true, itemsTotal: 90 })
    expect(quotedAddresses).toEqual(['Rua A, 10, ap 2'])
    expect(JSON.stringify(quote)).not.toContain('Rua A')
  })

  it('só mostra o pedido com o token certo', async () => {
    const { service } = buildService()
    const orderId = '55555555-5555-4555-8555-555555555555'
    const status = await service.orderStatus({ orderId, token: orderTrackingToken(orderId, SECRET) })
    expect(status).toMatchObject({
      number: 42,
      status: 'received',
      pixKey: { key: 'pix@yuyaki.com', holder: 'Yuyaki' },
      establishment: { id: ESTABLISHMENT_ID, name: 'Yuyaki Sushi Bar' },
    })
    await expect(service.orderStatus({ orderId, token: 'errado' })).rejects.toThrow()
  })
})
