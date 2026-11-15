import { describe, expect, it } from 'bun:test'

import { canMoveManually, canTransitionTo } from './Order'
import { statusLogNote } from '../../application/use-cases/UpdateOrderStatusUseCase'

describe('canTransitionTo', () => {
  it('fluxo normal só avança', () => {
    expect(canTransitionTo('received', 'in_production')).toBe(true)
    expect(canTransitionTo('ready', 'received')).toBe(false)
  })
})

describe('canMoveManually', () => {
  it('volta etapa', () => {
    expect(canMoveManually('ready', 'in_production')).toBe(true)
  })

  it('pula etapa', () => {
    expect(canMoveManually('received', 'in_delivery')).toBe(true)
  })

  it('reabre cancelado e concluído', () => {
    expect(canMoveManually('cancelled', 'received')).toBe(true)
    expect(canMoveManually('completed', 'in_delivery')).toBe(true)
  })

  it('não aceita o mesmo status', () => {
    expect(canMoveManually('ready', 'ready')).toBe(false)
  })
})

describe('statusLogNote', () => {
  const base = { orderId: 'o', establishmentId: 'e' }

  it('passo normal sem motivo não anota', () => {
    expect(statusLogNote({ ...base, newStatus: 'ready' }, true)).toBeNull()
  })

  it('cancelamento leva o motivo', () => {
    expect(statusLogNote({ ...base, newStatus: 'cancelled', cancellationReason: 'Cliente desistiu' }, true)).toBe('Cliente desistiu')
  })

  it('correção manual fica marcada no histórico, com o motivo', () => {
    expect(statusLogNote({ ...base, newStatus: 'in_production', manual: true }, false)).toBe('Alterado manualmente no painel')
    expect(statusLogNote({ ...base, newStatus: 'in_production', manual: true, note: 'marcado pronto sem querer' }, false)).toBe(
      'Alterado manualmente no painel: marcado pronto sem querer'
    )
  })
})
