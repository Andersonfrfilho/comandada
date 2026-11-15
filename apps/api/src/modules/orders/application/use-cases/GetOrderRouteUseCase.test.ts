import { describe, expect, it } from 'bun:test'

import { buildRoute, haversineKm } from './GetOrderRouteUseCase'
import type { RoutingProvider } from '@/shared/providers/RoutingProvider'

const restaurant = { lat: -20.5386, lng: -47.4008 }
const customer = { lat: -20.5631, lng: -47.4142 }

function routingReturning(result: { km: number; min: number } | null | Error): RoutingProvider {
  return {
    route: async () => {
      if (result instanceof Error) throw result
      return result
    },
  }
}

describe('haversineKm', () => {
  it('mede a distância em linha reta entre dois pontos de Franca', () => {
    expect(haversineKm(restaurant, customer)).toBeCloseTo(3.06, 1)
  })

  it('é zero para o mesmo ponto', () => {
    expect(haversineKm(restaurant, restaurant)).toBe(0)
  })
})

describe('buildRoute', () => {
  it('usa a rota de carro quando o roteador responde', async () => {
    const route = await buildRoute(restaurant, customer, routingReturning({ km: 4.267, min: 9.4 }))
    expect(route).toEqual({ origin: restaurant, destination: customer, distanceKm: 4.3, durationMin: 9, source: 'route' })
  })

  it('cai para linha reta, sem tempo, quando o roteador falha', async () => {
    const route = await buildRoute(restaurant, customer, routingReturning(new Error('fora do ar')))
    expect(route.source).toBe('straight_line')
    expect(route.durationMin).toBeNull()
    expect(route.distanceKm).toBe(3.1)
  })

  it('cai para linha reta quando o roteador não acha rota', async () => {
    const route = await buildRoute(restaurant, customer, routingReturning(null))
    expect(route.source).toBe('straight_line')
  })

  it('sem coordenadas do restaurante devolve só o destino', async () => {
    const route = await buildRoute(null, customer, routingReturning({ km: 1, min: 1 }))
    expect(route).toEqual({ origin: null, destination: customer, distanceKm: null, durationMin: null, source: null })
  })

  it('nunca promete menos de 1 minuto', async () => {
    const route = await buildRoute(restaurant, customer, routingReturning({ km: 0.1, min: 0.2 }))
    expect(route.durationMin).toBe(1)
  })
})
