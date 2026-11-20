import { describe, expect, it } from 'bun:test'
import { nextNumberAfter, orderNumberParity } from './orderNumber'

describe('número do pedido com loja e nuvem', () => {
  it('loja fica com ímpares, nuvem com pares, sem sincronização segue 1, 2, 3', () => {
    expect(orderNumberParity('loja')).toBe(1)
    expect(orderNumberParity('nuvem')).toBe(0)
    expect(orderNumberParity(undefined)).toBeNull()
  })

  it('pula para o próximo número da paridade do nó', () => {
    expect(nextNumberAfter(40, 1)).toBe(41)
    expect(nextNumberAfter(41, 1)).toBe(43)
    expect(nextNumberAfter(41, 0)).toBe(42)
    expect(nextNumberAfter(41, null)).toBe(42)
  })
})
