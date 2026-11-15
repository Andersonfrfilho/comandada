import { describe, expect, it } from 'bun:test'

import { buildPartialConfirmationMessage } from './RequestPartialOrderConfirmationUseCase'

const ceviche = { id: 'item-1', productName: 'Ceviche Mix', quantity: 1, totalPrice: '60.00' }
const camarao = { id: 'item-2', productName: 'Camarão Empanado', quantity: 2, totalPrice: '75.00' }

describe('buildPartialConfirmationMessage', () => {
  it('sem troca pede SIM/NÃO e soma só o que ficou', () => {
    const message = buildPartialConfirmationMessage({
      customerName: 'Anderson',
      unavailableItems: [ceviche],
      remainingItems: [camarao],
    })
    expect(message).toContain('• 1× Ceviche Mix')
    expect(message).toContain('R$ 75,00')
    expect(message).toContain('*SIM*')
  })

  it('com troca mostra a sugestão, o novo total e as opções 1/2/3', () => {
    const message = buildPartialConfirmationMessage({
      customerName: 'Anderson',
      unavailableItems: [ceviche],
      remainingItems: [camarao],
      substitutes: new Map([['item-1', { productName: 'Ceviche de Salmão', unitPrice: 58 }]]),
    })
    expect(message).toContain('sugerimos *Ceviche de Salmão*')
    expect(message).toContain('Com a troca, o valor dos itens fica: *R$ 133,00*')
    expect(message).toContain('*1* ✅ Aceitar a troca')
    expect(message).toContain('*2* 🔄 Escolher outro item')
    expect(message).toContain('*3* ➖ Seguir sem o item')
  })

  it('troca de item com quantidade 2 multiplica o preço', () => {
    const message = buildPartialConfirmationMessage({
      customerName: null,
      unavailableItems: [camarao],
      remainingItems: [ceviche],
      substitutes: new Map([['item-2', { productName: 'Lula Empanada', unitPrice: 30 }]]),
    })
    expect(message).toContain('R$ 120,00')
  })

  it('tudo em falta com troca não lista "continua tudo certo"', () => {
    const message = buildPartialConfirmationMessage({
      customerName: null,
      unavailableItems: [ceviche],
      remainingItems: [],
      substitutes: new Map([['item-1', { productName: 'Ceviche de Salmão', unitPrice: 58 }]]),
    })
    expect(message).not.toContain('Continua tudo certo')
  })
})
