import { describe, expect, it } from 'bun:test'

import { classifyStatusMove, nextStatus } from './orderStatusMoves'
import type { OrderStatus } from '@/constants/orderLabels'

const delivery: OrderStatus[] = ['received', 'in_production', 'ready', 'in_delivery', 'completed']
const pickup: OrderStatus[] = ['received', 'in_production', 'ready', 'picked_up', 'completed']

describe('classifyStatusMove', () => {
  it('próximo passo', () => {
    expect(classifyStatusMove(delivery, 'received', 'in_production')).toBe('forward')
  })

  it('pular etapa', () => {
    expect(classifyStatusMove(delivery, 'received', 'ready')).toBe('skip')
  })

  it('voltar', () => {
    expect(classifyStatusMove(delivery, 'ready', 'received')).toBe('back')
    expect(classifyStatusMove(delivery, 'completed', 'in_delivery')).toBe('back')
  })

  it('cancelar e reabrir', () => {
    expect(classifyStatusMove(delivery, 'ready', 'cancelled')).toBe('cancel')
    expect(classifyStatusMove(delivery, 'cancelled', 'received')).toBe('reopen')
  })
})

describe('nextStatus', () => {
  it('entrega vai de pronto para em entrega', () => {
    expect(nextStatus(delivery, 'ready')).toBe('in_delivery')
  })

  it('retirada vai de pronto para retirado', () => {
    expect(nextStatus(pickup, 'ready')).toBe('picked_up')
  })

  it('concluído não tem próximo', () => {
    expect(nextStatus(delivery, 'completed')).toBeNull()
  })
})
