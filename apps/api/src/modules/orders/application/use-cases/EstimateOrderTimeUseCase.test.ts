import { describe, expect, it } from 'bun:test'

import { estimateMinutes, pickDeliveryMinutes, pickPreparationMinutes } from './EstimateOrderTimeUseCase'

describe('estimateMinutes', () => {
  it('adds the kitchen queue and the delivery leg', () => {
    expect(estimateMinutes({ preparationMinutes: 20, ordersAhead: 2, deliveryMinutes: 15, isDelivery: true })).toBe(45)
  })

  it('caps the queue so a busy night does not promise two hours', () => {
    expect(estimateMinutes({ preparationMinutes: 20, ordersAhead: 40, deliveryMinutes: 15, isDelivery: false })).toBe(80)
  })
})

describe('pickPreparationMinutes', () => {
  it('usa a média real quando há medições suficientes', () => {
    expect(pickPreparationMinutes([{ registeredMinutes: 20, realAverageMinutes: 32.4, samples: 8 }])).toBe(32)
  })

  it('fica com o tempo cadastrado quando há poucas medições', () => {
    expect(pickPreparationMinutes([{ registeredMinutes: 20, realAverageMinutes: 45, samples: 2 }])).toBe(20)
  })

  it('o item mais demorado manda, misturando real e cadastrado', () => {
    expect(
      pickPreparationMinutes([
        { registeredMinutes: 5, realAverageMinutes: 3, samples: 10 },
        { registeredMinutes: 25, realAverageMinutes: null, samples: 0 },
      ])
    ).toBe(25)
  })

  it('sem real nem cadastro devolve undefined (vale o padrão)', () => {
    expect(pickPreparationMinutes([{ registeredMinutes: null, realAverageMinutes: null, samples: 0 }])).toBeUndefined()
  })
})

describe('pickDeliveryMinutes', () => {
  it('usa a média de rua com amostras suficientes', () => {
    expect(pickDeliveryMinutes(17.6, 12)).toBe(18)
  })

  it('ignora a média com poucas entregas', () => {
    expect(pickDeliveryMinutes(40, 3)).toBeUndefined()
  })
})
