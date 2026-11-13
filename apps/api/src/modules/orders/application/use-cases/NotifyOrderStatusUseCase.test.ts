import { describe, expect, it } from 'bun:test'

import { buildOrderStatusMessage, buildOrderStatusTemplateText } from './NotifyOrderStatusUseCase'

describe('buildOrderStatusMessage', () => {
  it('tells a pickup customer the order is ready to collect', () => {
    expect(buildOrderStatusMessage({ status: 'ready', type: 'pickup', code: 'PED-1' })).toContain('te esperando aqui no balcão')
  })

  it('stays quiet when a delivery order is only ready in the kitchen', () => {
    expect(buildOrderStatusMessage({ status: 'ready', type: 'delivery', code: 'PED-1' })).toBeUndefined()
  })

  it('announces the courier leaving', () => {
    expect(buildOrderStatusMessage({ status: 'in_delivery', type: 'delivery', code: 'PED-1' })).toContain('Saiu para entrega')
  })

  it('tells a delivery customer the order arrived, but not pickup (already told when ready)', () => {
    expect(buildOrderStatusMessage({ status: 'completed', type: 'delivery', code: 'PED-1' })).toContain('Pedido entregue')
    expect(buildOrderStatusMessage({ status: 'completed', type: 'pickup', code: 'PED-1' })).toBeUndefined()
  })

  it('has a one-line template text for every message (outside the 24h window)', () => {
    const text = buildOrderStatusTemplateText({ status: 'in_delivery', type: 'delivery' })
    expect(text).toBeDefined()
    expect(text).not.toContain('\n')
  })
})
