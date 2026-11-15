import { describe, expect, it } from 'bun:test'
import { formatDeliveryAddress } from './deliveryAddress'

describe('formatDeliveryAddress', () => {
  it('usa a linha única dos pedidos novos', () => {
    expect(formatDeliveryAddress({ address: 'Rua A, 10 - Centro', complement: 'ap 2' })).toBe('Rua A, 10 - Centro')
  })
  it('monta o endereço dos pedidos antigos com rua e número separados', () => {
    expect(formatDeliveryAddress({ street: 'Rua B', number: '780', neighborhood: 'Centro', city: 'Belém', state: 'PA' }))
      .toBe('Rua B, 780 · Centro · Belém - PA')
  })
  it('sem endereço não quebra', () => {
    expect(formatDeliveryAddress(null)).toBe('')
  })
})
