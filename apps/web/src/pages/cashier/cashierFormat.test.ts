import { describe, expect, it } from 'bun:test'
import { closingDifference, parseMoneyInput } from './cashierFormat'

describe('parseMoneyInput', () => {
  it('aceita vírgula e ponto', () => {
    expect(parseMoneyInput('120,50')).toBe(120.5)
    expect(parseMoneyInput('1.234,56')).toBe(1234.56)
    expect(parseMoneyInput('99.9')).toBe(99.9)
  })

  it('vazio ou inválido não vira zero', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('abc')).toBeNull()
    expect(parseMoneyInput('-5')).toBeNull()
  })
})

describe('closingDifference', () => {
  it('negativo é falta, sem erro de centavo', () => {
    expect(closingDifference(120, '125.00')).toBe(-5)
    expect(closingDifference(0.3, '0.10')).toBe(0.2)
  })
})
