interface RouteResult {
  km: number;
  min: number;
}

interface RoutingProvider {
  route(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<RouteResult | null>;
}
