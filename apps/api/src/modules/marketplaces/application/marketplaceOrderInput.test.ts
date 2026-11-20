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
    expect(notes).toContain('Cobrar na entrega: Dinheiro R$ 50,00 (troco para R$ 100,00: levar R$ 50,00)')
    expect(notes).toContain('Desconto no iFood: R$ 5,00')
    expect(notes).toContain('Entrega pelo iFood')
    expect(notes).toContain('Código de coleta: 4321')
    expect(notes).toContain('Referência: portão azul')
    expect(notes).toContain('Obs.: tocar a campainha')
  })

  it('mostra bandeira, cupom com quem paga, mesa e CPF da nota', () => {
    const notes = buildOrderNotes({
      ...baseOrder,
      type: 'table',
      table: '12',
      customerDocument: '123.456.789-00',
      payments: [{ method: 'Crédito', brand: 'VISA', prepaid: true, amount: 106 }],
      benefits: [{ amount: 5, description: 'PRIMEIRA', sponsors: [{ name: 'iFood', amount: 3 }, { name: 'loja', amount: 2 }] }],
    })
    expect(notes).toContain('Mesa 12 (consumo no local)')
    expect(notes).toContain('Pago no iFood: Crédito VISA R$ 106,00')
    expect(notes).toContain('Cupom/desconto "PRIMEIRA": R$ 5,00 (R$ 3,00 pago por iFood, R$ 2,00 pago por loja)')
    expect(notes).toContain('CPF/CNPJ na nota: 123.456.789-00')
    expect(notes).not.toContain('Desconto no iFood')
  })

  it('99Food mostra o número do dia e o id do pedido', () => {
    const notes = buildOrderNotes({ ...baseOrder, platform: '99food', displayId: '7', externalId: '5764607801871631353' })
    expect(notes).toContain('Pedido 99Food #7')
    expect(notes).toContain('ID do pedido na 99Food: 5764607801871631353')
  })
})
