import { describe, expect, it } from 'bun:test'

import {
  buildPanelContext,
  DrizzleConversationPanelContextReader,
  type PanelContextSources,
  type PanelLastOrder,
} from './ConversationPanelContext'

const PAYMENT_LABELS = { cartao: 'Cartão (na entrega)', dinheiro: 'Dinheiro', pix: 'Pix' }
const ORDER_TYPE_LABELS = { delivery: 'Entrega', retirada: 'Retirada no balcão' }

// O pedido do relato: Ceviche Mix + Camarão Empanado, entrega, cartão, R$ 135.
const LAST_ORDER: PanelLastOrder = {
  code: 'PED-20261114-6772',
  status: 'received',
  type: 'delivery',
  totalAmount: 135,
  receivedAt: new Date('2026-11-15T00:39:30Z'),
  address: 'Rua Radialista Alfeu Stabelini, 6531',
  items: [
    { name: 'Ceviche Mix', quantity: 1, price: 75 },
    { name: 'Camarão Empanado', quantity: 1, price: 52 },
  ],
  payments: [{ method: 'cartao', changeFor: null }],
}

// Intl separa "R$" do valor com espaço inquebrável; o teste compara o texto que a pessoa lê.
function plain(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, typeof value === 'string' ? value.replace(/\u00a0/g, ' ') : value])
  )
}

function sources(overrides: Partial<PanelContextSources>): PanelContextSources {
  return {
    session: null,
    customerName: null,
    lastOrder: null,
    paymentLabels: PAYMENT_LABELS,
    orderTypeLabels: ORDER_TYPE_LABELS,
    ...overrides,
  }
}

describe('buildPanelContext', () => {
  it('depois de confirmar (carrinho zerado) mostra o que foi coletado no último pedido', () => {
    const panel = buildPanelContext(
      sources({
        session: { state: 'start', cart: { items: [], order_type: '', payment_method: '' } },
        customerName: 'Anderson Fernandes',
        lastOrder: LAST_ORDER,
      })
    )

    expect(panel.currentState).toBe('start')
    expect(plain(panel.context)).toEqual({
      name: 'Anderson Fernandes',
      address: 'Rua Radialista Alfeu Stabelini, 6531',
      deliveryType: 'Entrega',
      paymentType: 'Cartão (na entrega)',
      lastOrder:
        'PED-20261114-6772 · Recebido · R$ 135,00 · 14/11, 21:39 — 1x Ceviche Mix, 1x Camarão Empanado',
    })
  })

  it('com pedido em andamento usa o carrinho da sessão do bot, não o pedido anterior', () => {
    const panel = buildPanelContext(
      sources({
        session: {
          state: 'awaiting_change',
          cart: {
            items: [{ id: 'p1', name: 'Hot Roll', qty: 2, price: 30 }],
            order_type: 'delivery',
            address: 'Av. São Carlos, 100',
            complement: 'Apto 12',
            payment_method: 'dinheiro',
            change_for: 100,
          },
        },
        lastOrder: LAST_ORDER,
      })
    )

    expect(panel.currentState).toBe('awaiting_change')
    expect(plain(panel.context)).toMatchObject({
      address: 'Av. São Carlos, 100',
      complement: 'Apto 12',
      deliveryType: 'Entrega',
      paymentType: 'Dinheiro',
      change: 'Troco para R$ 100,00',
      cart: [{ name: 'Hot Roll', quantity: 2, price: 30 }],
    })
    expect(panel.context['lastOrder']).toContain('PED-20261114-6772')
  })

  it('retirada não carrega endereço velho que ficou no carrinho', () => {
    const panel = buildPanelContext(
      sources({
        session: {
          state: 'awaiting_payment',
          cart: { items: [{ name: 'Temaki', qty: 1, price: 37 }], order_type: 'retirada', address: 'Rua antiga, 1' },
        },
      })
    )

    expect(panel.context['address']).toBeUndefined()
    expect(panel.context['deliveryType']).toBe('Retirada no balcão')
  })

  it('pagamento dividido junta as formas e mostra o troco pedido', () => {
    const panel = buildPanelContext(
      sources({
        lastOrder: {
          ...LAST_ORDER,
          payments: [
            { method: 'pix', changeFor: null },
            { method: 'dinheiro', changeFor: 50 },
            { method: 'pix', changeFor: null },
          ],
        },
      })
    )

    expect(panel.context['paymentType']).toBe('Pix + Dinheiro')
    expect(plain(panel.context)['change']).toBe('Troco para R$ 50,00')
  })

  it('sem sessão nem pedido não inventa campos e fica no início', () => {
    expect(buildPanelContext(sources({}))).toEqual({ currentState: 'start', context: {} })
  })

  it('forma de pagamento sem cadastro aparece pelo nome do bot', () => {
    const panel = buildPanelContext(
      sources({ session: { state: 'confirming', cart: { items: [{ name: 'X', qty: 1, price: 1 }], payment_method: 'vale' } } })
    )
    expect(panel.context['paymentType']).toBe('vale')
  })
})

describe('DrizzleConversationPanelContextReader', () => {
  function buildReader(customerName: string) {
    const database = {
      query: {
        botSessions: { findFirst: async () => ({ state: 'start', cart: { items: [] } }) },
        customers: { findFirst: async () => ({ id: 'c1', name: customerName, whatsappNumber: '5516993056772' }) },
        orders: {
          findFirst: async () => ({
            id: 'o1',
            code: 'PED-1',
            status: 'in_production',
            type: 'delivery',
            totalAmount: '135.00',
            receivedAt: new Date('2026-11-15T00:39:30Z'),
          }),
        },
        orderItems: {
          findMany: async () => [{ productName: 'Ceviche Mix', quantity: 1, unitPrice: '75.00' }],
        },
        orderPayments: { findMany: async () => [{ paymentTypeName: 'cartao', changeFor: null }] },
        deliveries: {
          findFirst: async () => ({ addressSnapshot: { address: 'Rua Radialista Alfeu Stabelini, 6531', complement: null } }),
        },
      },
    }
    const botConfig = {
      listActivePaymentTypes: async () => [{ id: 1, name: 'cartao', type: 'card', label: 'Cartão', config: {} }],
      listActiveOrderTypes: async () => [{ id: 1, name: 'delivery', type: 'delivery', label: 'Entrega' }],
    }
    return new DrizzleConversationPanelContextReader(database as never, botConfig)
  }

  it('lê a sessão do bot, o cliente e o último pedido gravado', async () => {
    const panel = await buildReader('Anderson Fernandes').read({
      establishmentId: 'e1',
      whatsappNumber: '5516993056772',
    })

    expect(plain(panel.context)).toMatchObject({
      name: 'Anderson Fernandes',
      address: 'Rua Radialista Alfeu Stabelini, 6531',
      deliveryType: 'Entrega',
      paymentType: 'Cartão',
    })
    expect(plain(panel.context)['lastOrder']).toContain('PED-1 · Em preparo · R$ 135,00')
  })

  it('não mostra o número como nome enquanto o cliente não se apresentou', async () => {
    const panel = await buildReader('5516993056772').read({ establishmentId: 'e1', whatsappNumber: '5516993056772' })
    expect(panel.context['name']).toBeUndefined()
  })
})
