import type { RoutingProvider, RouteResult } from '@/shared/providers/RoutingProvider'

const OSRM_USER_AGENT = 'SakuraBotOficial/1.0'

type OsrmRoute = {
  distance: number
  duration: number
}

type OsrmResponse = {
  routes?: OsrmRoute[]
}

export class OsrmRoutingProviderImplementation implements RoutingProvider {
  async route(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<RouteResult | null> {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`
    const response = await fetch(url, { headers: { 'User-Agent': OSRM_USER_AGENT } })
    const data = (await response.json()) as OsrmResponse
    const route = data.routes?.[0]
    if (!route) return null
    return { km: route.distance / 1000, min: Math.round(route.duration / 60) }
  }
}
