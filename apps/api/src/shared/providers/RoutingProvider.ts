export type RouteResult = {
  readonly km: number
  readonly min: number
}

export interface RoutingProvider {
  route(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<RouteResult | null>
}
