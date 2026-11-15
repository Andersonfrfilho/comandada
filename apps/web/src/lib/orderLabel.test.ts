import { describe, expect, it } from 'bun:test'
import { orderNumberLabel, orderPartyLabel } from './orderLabel'

describe('orderLabel', () => {
  it('número curto primeiro, depois código do bot, depois o id', () => {
    expect(orderNumberLabel({ id: 'abc', number: 42, code: 'PED-1' })).toBe('#42')
    expect(orderNumberLabel({ id: 'abc', number: null, code: 'PED-1' })).toBe('PED-1')
    expect(orderNumberLabel({ id: '5bf73444-aaaa', number: null })).toBe('#5BF73444')
  })

  it('mesa e cliente', () => {
    expect(orderPartyLabel({ type: 'table', table: { number: 5 }, customer: null })).toBe('Mesa 5')
    expect(orderPartyLabel({ type: 'table', table: { number: 5 }, customer: { name: 'Ana' } })).toBe('Mesa 5 · Ana')
    expect(orderPartyLabel({ type: 'pickup', customer: { name: 'Ana' } })).toBe('Ana')
    expect(orderPartyLabel({ type: 'pickup' })).toBeNull()
  })
})
