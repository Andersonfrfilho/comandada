import { describe, expect, it } from 'bun:test'
import type { MarketplaceOrder } from '../domain/Marketplace'
import { buildOrderNotes, toOrderItems } from './marketplaceOrderInput'

const baseOrder: MarketplaceOrder = {
  platform: 'ifood',
  externalId: 'x',
  displayId: '8312',
  type: 'delivery',
  customerName: 'Maria',
  customerPhone: '0800 123 (código 999)',
  items: [
    { name: 'Hot roll', externalCode: 'prod-1', quantity: 1, unitPrice: 30, options: [] },
    { name: 'Temaki Salmão', quantity: 2, unitPrice: 22, notes: 'sem cebolinha', options: [{ name: 'Cream cheese', quantity: 1, unitPrice: 2 }] },
    { name: 'Coca 2L', quantity: 1, unitPrice: 15, options: [] },
  ],
  deliveryFee: 7,
  discount: 5,
  orderAmount: 111,
  payments: [
    { method: 'Crédito', prepaid: true, amount: 61 },
    { method: 'Dinheiro', prepaid: false, amount: 50, changeFor: 100 },
  ],
  deliveryAddress: { formatted: 'Rua A, 1', reference: 'portão azul' },
  deliveredBy: 'platform',
  pickupCode: '4321',
  notes: 'tocar a campainha',
}

const products = [
  { id: 'prod-1', name: 'Hot roll (10 un)', barcode: null },
  { id: 'prod-2', name: 'Temaki salmao', barcode: null },
]

describe('toOrderItems', () => {
  it('liga pelo código do PDV, depois pelo nome sem acento; sem vínculo entra com o nome da plataforma', () => {
    const items = toOrderItems(baseOrder, products)
    expect(items[0]).toMatchObject({ productId: 'prod-1', productName: 'Hot roll (10 un)', unitPrice: 30 })
    expect(items[1]).toMatchObject({ productId: 'prod-2', quantity: 2, notes: '+ 1x Cream cheese · sem cebolinha' })
    expect(items[2]).toEqual({ productName: 'Coca 2L', unitPrice: 15, quantity: 1, notes: '[iFood] sem vínculo no cardápio' })
  })
})

describe('buildOrderNotes', () => {
  it('resume origem, pagamento, cobrança e recados', () => {
    const notes = buildOrderNotes(baseOrder)
    expect(notes).toContain('Pedido iFood #8312')
    expect(notes).toContain('Pago no iFood: Crédito R$ 61,00')
    expect(notes).toContain('Cobrar na entrega: Dinheiro R$ 50,00 (troco para R$ 100,00)')
    expect(notes).toContain('Desconto no iFood: R$ 5,00')
    expect(notes).toContain('Entrega pelo iFood')
    expect(notes).toContain('Código de coleta: 4321')
    expect(notes).toContain('Referência: portão azul')
    expect(notes).toContain('Obs.: tocar a campainha')
  })
})
