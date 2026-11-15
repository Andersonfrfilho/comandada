import { describe, expect, it } from 'bun:test'
import { allocateComandaPayments } from './allocateComandaPayments'

describe('allocateComandaPayments', () => {
  it('splits a payment part across orders in launch order', () => {
    const parts = allocateComandaPayments(
      [{ orderId: 'a', outstandingAmount: 80 }, { orderId: 'b', outstandingAmount: 40 }],
      [{ paymentTypeName: 'dinheiro', amount: 50 }, { paymentTypeName: 'cartao_credito', amount: 70 }]
    )
    expect(parts).toEqual([
      { orderId: 'a', paymentTypeName: 'dinheiro', amount: 50 },
      { orderId: 'a', paymentTypeName: 'cartao_credito', amount: 30 },
      { orderId: 'b', paymentTypeName: 'cartao_credito', amount: 40 },
    ])
  })

  it('keeps the rounding of a split bill on the last order', () => {
    const parts = allocateComandaPayments(
      [{ orderId: 'a', outstandingAmount: 100 }],
      [
        { paymentTypeName: 'pix', amount: 33.33, splitLabel: 'Pessoa 1' },
        { paymentTypeName: 'pix', amount: 33.33, splitLabel: 'Pessoa 2' },
        { paymentTypeName: 'pix', amount: 33.35, splitLabel: 'Pessoa 3' },
      ]
    )
    const total = parts.reduce((sum, part) => sum + Math.round(part.amount * 100), 0)
    expect(total).toBe(10001)
    expect(parts.map((part) => part.splitLabel)).toEqual(['Pessoa 1', 'Pessoa 2', 'Pessoa 3'])
  })

  it('keeps change on the cash part', () => {
    const parts = allocateComandaPayments(
      [{ orderId: 'a', outstandingAmount: 30 }, { orderId: 'b', outstandingAmount: 20 }],
      [{ paymentTypeName: 'dinheiro', amount: 50, changeFor: 100 }]
    )
    expect(parts[1]).toEqual({ orderId: 'b', paymentTypeName: 'dinheiro', amount: 20, changeFor: 100 })
    expect(parts[0]?.changeFor).toBeUndefined()
  })
})
