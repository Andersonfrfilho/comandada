import { describe, expect, it } from 'bun:test'

import { classifyStatusMove, nextStatus, requiresManualFlag, statusChoices } from './orderStatusMoves'
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

describe('requiresManualFlag', () => {
  it('passo natural vai sem manual', () => {
    expect(requiresManualFlag('received', 'in_production')).toBe(false)
    expect(requiresManualFlag('received', 'cancelled')).toBe(false)
  })

  it('cancelar pedido concluído ou pronto vai como manual', () => {
    expect(requiresManualFlag('completed', 'cancelled')).toBe(true)
    expect(requiresManualFlag('ready', 'cancelled')).toBe(true)
    expect(requiresManualFlag('picked_up', 'cancelled')).toBe(true)
  })
})

describe('statusChoices', () => {
  it('em preparo: próximo fica no botão principal, o resto separado em pular e voltar', () => {
    expect(statusChoices(delivery, 'in_production')).toEqual({
      skip: ['in_delivery', 'completed'],
      back: ['received'],
      reopen: [],
      canCancel: true,
    })
  })

  it('voltar lista da etapa mais próxima para a mais antiga', () => {
    expect(statusChoices(pickup, 'completed').back).toEqual(['picked_up', 'ready', 'in_production', 'received'])
    expect(statusChoices(pickup, 'completed').skip).toEqual([])
  })

  it('cancelado só oferece reabrir', () => {
    expect(statusChoices(pickup, 'cancelled')).toEqual({
      skip: [],
      back: [],
      reopen: pickup,
      canCancel: false,
    })
  })
})
