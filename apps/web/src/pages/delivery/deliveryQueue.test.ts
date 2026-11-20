import { describe, expect, it } from 'bun:test'
import { deliveryDeadline, deliveryGroup, groupDeliveries, sinceLabel, telUrl, whatsappUrl, type QueueDelivery } from './deliveryQueue'

const NOW = new Date('2026-11-20T19:00:00Z').getTime()
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()
const clock = (value: string) => value.slice(11, 16)

function delivery(overrides: Partial<QueueDelivery> & { orderStatus?: string; estimated?: number | null; created?: number }): QueueDelivery & { id: string } {
  return {
    id: Math.random().toString(36),
    status: overrides.status ?? 'pending',
    order: {
      status: overrides.orderStatus ?? 'ready',
      estimatedAt: overrides.estimated === null || overrides.estimated === undefined ? null : at(overrides.estimated),
      scheduledFor: null,
      createdAt: at(overrides.created ?? -30),
    },
  }
}

describe('deliveryGroup', () => {
  it('separa em rota, pronto e cozinha', () => {
    expect(deliveryGroup(delivery({ status: 'dispatched', orderStatus: 'in_delivery' }))).toBe('on_route')
    expect(deliveryGroup(delivery({ orderStatus: 'ready' }))).toBe('ready')
    expect(deliveryGroup(delivery({ orderStatus: 'in_production' }))).toBe('kitchen')
    expect(deliveryGroup(delivery({ orderStatus: 'received' }))).toBe('kitchen')
  })
})

describe('groupDeliveries', () => {
  it('ordena pela hora prometida e, sem ela, por quem entrou antes', () => {
    const late = delivery({ estimated: -5 })
    const later = delivery({ estimated: 20 })
    const noEstimateOld = delivery({ estimated: null, created: -60 })
    const noEstimateNew = delivery({ estimated: null, created: -5 })
    const groups = groupDeliveries([noEstimateNew, later, noEstimateOld, late])
    expect(groups.ready.map((item) => item.id)).toEqual([late.id, later.id, noEstimateOld.id, noEstimateNew.id])
    expect(groups.on_route).toEqual([])
  })
})

describe('deliveryDeadline', () => {
  it('mostra atraso, prazo curto e hora longe', () => {
    expect(deliveryDeadline(delivery({ estimated: -4 }), NOW, clock)).toEqual({ label: 'Atrasado 4 min', tone: 'late' })
    expect(deliveryDeadline(delivery({ estimated: 8 }), NOW, clock)).toEqual({ label: 'Faltam 8 min', tone: 'soon' })
    expect(deliveryDeadline(delivery({ estimated: 25 }), NOW, clock)).toEqual({ label: 'Faltam 25 min', tone: 'ok' })
    expect(deliveryDeadline(delivery({ estimated: 150 }), NOW, clock)).toEqual({ label: 'Para 21:30', tone: 'ok' })
    expect(deliveryDeadline(delivery({ estimated: -75 }), NOW, clock)?.label).toBe('Atrasado 1 h 15 min')
    expect(deliveryDeadline(delivery({ estimated: null }), NOW, clock)).toBeNull()
  })
})

describe('sinceLabel e links', () => {
  it('conta o tempo na rua e monta os links do cliente', () => {
    expect(sinceLabel(at(-18), NOW)).toBe('há 18 min')
    expect(sinceLabel(at(0), NOW)).toBe('agora')
    expect(sinceLabel(null, NOW)).toBeNull()
    expect(whatsappUrl('+55 (11) 98765-4321')).toBe('https://wa.me/5511987654321')
    expect(telUrl('5511987654321')).toBe('tel:+5511987654321')
  })
})
