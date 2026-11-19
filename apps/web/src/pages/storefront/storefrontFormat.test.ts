import { describe, expect, test } from 'bun:test'
import {
  addToCart,
  cartCount,
  cartTotal,
  changeQuantity,
  composeAddress,
  currentStepIndex,
  EMPTY_ADDRESS,
  hoursLabel,
  isCompletePhone,
  maskCep,
  maskPhone,
  normalizeSearch,
  orderStatusBadge,
} from './storefrontFormat'

describe('cardápio online', () => {
  test('máscara do WhatsApp e do CEP', () => {
    expect(maskPhone('16988881234')).toBe('(16) 98888-1234')
    expect(maskPhone('5516988881234')).toBe('(16) 98888-1234')
    expect(maskPhone('1633221100')).toBe('(16) 3322-1100')
    expect(maskPhone('169')).toBe('(16) 9')
    expect(isCompletePhone('(16) 98888-1234')).toBe(true)
    expect(isCompletePhone('(16) 9888')).toBe(false)
    expect(maskCep('14400123')).toBe('14400-123')
  })

  test('horário em São Paulo', () => {
    const hours = { isOpen: false, openingTime: '18:00', closingTime: '23:00', workingDays: ['qua', 'sex'] }
    // Quarta 10h
    expect(hoursLabel(hours, new Date('2026-11-18T13:00:00Z'))).toBe('Fechado · abre hoje às 18h')
    // Quarta 23h30 → sexta
    expect(hoursLabel(hours, new Date('2026-11-19T02:30:00Z'))).toBe('Fechado · abre sexta às 18h')
    expect(hoursLabel({ ...hours, workingDays: ['qui'] }, new Date('2026-11-18T13:00:00Z'))).toBe('Fechado · abre amanhã às 18h')
    expect(hoursLabel({ ...hours, isOpen: true, closingTime: '23:30' }, new Date())).toBe('Aberto até 23h30')
  })

  test('carrinho junta mesmo item com a mesma observação', () => {
    let lines = addToCart([], { productId: 'a', name: 'Combo', unitPrice: 50, quantity: 1, notes: '' })
    lines = addToCart(lines, { productId: 'a', name: 'Combo', unitPrice: 50, quantity: 2, notes: ' ' })
    lines = addToCart(lines, { productId: 'a', name: 'Combo', unitPrice: 50, quantity: 1, notes: 'sem cebolinha' })
    expect(lines).toHaveLength(2)
    expect(cartCount(lines)).toBe(4)
    expect(cartTotal(lines)).toBe(200)
    lines = changeQuantity(lines, lines[0]!.lineId, 0)
    expect(lines).toHaveLength(1)
  })

  test('endereço numa linha com a cidade do restaurante quando falta', () => {
    const address = { ...EMPTY_ADDRESS, street: 'Rua das Flores', number: '123', district: 'Centro' }
    expect(composeAddress(address, 'Franca/SP')).toBe('Rua das Flores, 123 - Centro, Franca/SP')
    expect(composeAddress({ ...address, city: 'Ribeirão Preto/SP' }, 'Franca/SP')).toBe('Rua das Flores, 123 - Centro, Ribeirão Preto/SP')
  })

  test('passo do pedido', () => {
    expect(currentStepIndex('delivery', 'ready')).toBe(1)
    expect(currentStepIndex('delivery', 'in_delivery')).toBe(2)
    expect(currentStepIndex('pickup', 'ready')).toBe(2)
    expect(currentStepIndex('pickup', 'completed')).toBe(3)
  })

  test('busca sem acento', () => {
    expect(normalizeSearch('Temaki Salmão')).toContain('salmao')
  })

  test('selo do status em Meus pedidos', () => {
    expect(orderStatusBadge('delivery', 'in_production', 'not_required')).toEqual({ label: 'Em preparo', tone: 'active' })
    expect(orderStatusBadge('delivery', 'ready', 'not_required')).toEqual({ label: 'Em preparo', tone: 'active' })
    expect(orderStatusBadge('delivery', 'in_delivery', null)).toEqual({ label: 'Saiu para entrega', tone: 'active' })
    expect(orderStatusBadge('retirada', 'ready', null)).toEqual({ label: 'Pronto para retirar', tone: 'active' })
    expect(orderStatusBadge('delivery', 'completed', 'paid')).toEqual({ label: 'Entregue', tone: 'done' })
    expect(orderStatusBadge('retirada', 'completed', null)).toEqual({ label: 'Retirado', tone: 'done' })
    expect(orderStatusBadge('delivery', 'received', 'awaiting')).toEqual({ label: 'Aguardando pagamento', tone: 'payment' })
    expect(orderStatusBadge('delivery', 'cancelled', 'awaiting')).toEqual({ label: 'Cancelado', tone: 'cancelled' })
  })
})
