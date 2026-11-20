import { describe, expect, it } from 'bun:test'
import {
  addToCart,
  cartCount,
  cartTotal,
  changeQuantity,
  formatPhoneInput,
  isTableOrderReady,
  isValidPhone,
  isWaiterPath,
  itemStage,
  phoneDigits,
  readStatusChange,
  readyNoticeLabel,
  setLineNotes,
  tableOrderBody,
  type WaiterProduct,
} from './waiterModel'

const temaki: WaiterProduct = { id: 'p1', name: 'Temaki', description: null, price: '29.90', catalogId: 'c1' }
const grande: WaiterProduct = {
  id: 'p2',
  name: 'Combo G',
  description: null,
  price: '89.00',
  catalogId: 'c1',
  variantGroup: 'Combo tradicional',
  variantLabel: 'Grande',
}

describe('carrinho do garçom', () => {
  it('soma o mesmo prato na mesma linha e separa por observação', () => {
    let cart = addToCart([], temaki)
    cart = addToCart(cart, temaki)
    cart = addToCart(cart, temaki, 'sem cebolinha')
    expect(cart).toHaveLength(2)
    expect(cartCount(cart)).toBe(3)
    expect(cartTotal(cart)).toBe(89.7)
  })

  it('põe o tamanho no nome que vai para a cozinha', () => {
    expect(addToCart([], grande)[0]?.productName).toBe('Combo tradicional — Grande')
  })

  it('tira a linha quando a quantidade chega a zero', () => {
    const cart = addToCart([], temaki)
    expect(changeQuantity(cart, cart[0]!.key, -1)).toEqual([])
  })

  it('observação igual a outra linha junta as duas', () => {
    let cart = addToCart([], temaki, 'sem gergelim')
    cart = addToCart(cart, temaki)
    const plain = cart.find((line) => !line.notes)!
    const merged = setLineNotes(cart, plain.key, 'Sem gergelim')
    expect(merged).toHaveLength(1)
    expect(merged[0]?.quantity).toBe(2)
  })

  it('monta o pedido de mesa sem pagamento, ligado à comanda', () => {
    const cart = addToCart(addToCart([], temaki, 'bem passado'), grande)
    const body = tableOrderBody({ id: 'o-1', tableId: 't1', comandaId: 'c1', cart, notes: '  ' })
    expect(body).toMatchObject({ id: 'o-1', type: 'table', tableId: 't1', comandaId: 'c1', payments: [], channel: 'manual' })
    expect(body.items[0]).toEqual({ productId: 'p1', productName: 'Temaki', unitPrice: 29.9, quantity: 1, notes: 'bem passado' })
    expect('notes' in body).toBe(false)
  })
})

describe('situação do item', () => {
  it('check da cozinha no item vale antes do pedido inteiro ficar pronto', () => {
    expect(itemStage({ status: 'in_production' }, { readyAt: '2026-11-20T10:00:00Z' })).toBe('ready')
    expect(itemStage({ status: 'in_production' }, { readyAt: null })).toBe('preparing')
    expect(itemStage({ status: 'received' }, {})).toBe('waiting')
    expect(itemStage({ status: 'completed' }, {})).toBe('served')
    expect(itemStage({ status: 'cancelled' }, { readyAt: '2026-11-20T10:00:00Z' })).toBe('cancelled')
  })
})

describe('telefone digitado na mesa', () => {
  it('formata enquanto digita e aceita com ou sem o 55', () => {
    expect(formatPhoneInput('16999991234')).toBe('(16) 99999-1234')
    expect(formatPhoneInput('1633334444')).toBe('(16) 3333-4444')
    expect(phoneDigits('5516999991234')).toBe('16999991234')
    expect(isValidPhone('(16) 99999-1234')).toBe(true)
    expect(isValidPhone('9999')).toBe(false)
  })
})

describe('aviso de pedido pronto', () => {
  it('só pedido de mesa que ficou pronto avisa o garçom', () => {
    const change = readStatusChange({ orderId: 'o1', newStatus: 'ready', type: 'table', number: 12, tableId: 't1', comandaId: 'c1' })
    expect(change && isTableOrderReady(change)).toBe(true)
    const delivery = readStatusChange({ orderId: 'o2', newStatus: 'ready', type: 'delivery' })
    expect(delivery && isTableOrderReady(delivery)).toBe(false)
    expect(readStatusChange({ newStatus: 'ready' })).toBeNull()
  })

  it('texto do aviso', () => {
    expect(readyNoticeLabel({ number: 12, tableNumber: 5 })).toBe('Mesa 5 · Pedido #12 pronto')
    expect(readyNoticeLabel({ number: null, tableNumber: null })).toBe('Pedido pronto')
  })

  it('reconhece as rotas do app do garçom', () => {
    expect(isWaiterPath('/garcom')).toBe(true)
    expect(isWaiterPath('/garcom/mesa/1')).toBe(true)
    expect(isWaiterPath('/garcomx')).toBe(false)
    expect(isWaiterPath('/tables')).toBe(false)
  })
})
