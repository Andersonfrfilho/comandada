import { describe, expect, it } from 'bun:test'
import { summarizeCashRegister } from './cashRegisterSummary'

describe('summarizeCashRegister', () => {
  it('só dinheiro entra no esperado da gaveta', () => {
    const summary = summarizeCashRegister('50.00', [
      { type: 'payment', paymentMethod: 'pix', amount: '33.90' },
    ])
    // O caso do print da auditoria: antes mostrava R$ 83,90 esperados com só R$ 50,00 na gaveta.
    expect(summary.expectedCash).toBe('50.00')
    expect(summary.balance).toBe('83.90')
  })

  it('soma suprimento, tira sangria e devolução em dinheiro, e separa por forma', () => {
    const summary = summarizeCashRegister('100.00', [
      { type: 'payment', paymentMethod: 'cash', amount: '40.00' },
      { type: 'payment', paymentMethod: 'card_debit', amount: '25.50' },
      { type: 'refund', paymentMethod: 'card_debit', amount: '5.50' },
      { type: 'refund', paymentMethod: 'cash', amount: '10.00' },
      { type: 'supply', paymentMethod: null, amount: '20.00' },
      { type: 'withdrawal', paymentMethod: null, amount: '30.00' },
    ])
    expect(summary.expectedCash).toBe('120.00')
    expect(summary.totalIn).toBe('85.50')
    expect(summary.totalOut).toBe('45.50')
    expect(summary.byMethod).toEqual([
      { method: 'cash', received: '40.00', refunded: '10.00', net: '30.00' },
      { method: 'card_debit', received: '25.50', refunded: '5.50', net: '20.00' },
    ])
  })

  it('não acumula erro de centavos', () => {
    const movements = Array.from({ length: 10 }, () => ({ type: 'payment', paymentMethod: 'cash', amount: '0.10' }))
    expect(summarizeCashRegister('0.00', movements).expectedCash).toBe('1.00')
  })
})
