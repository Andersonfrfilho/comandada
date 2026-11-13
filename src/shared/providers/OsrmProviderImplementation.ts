class OsrmProviderImplementation implements RoutingProvider {
  constructor(private readonly http: HttpClientProvider) {}

  async route(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<RouteResult | null> {
    const data = await this.http.request<OsrmResponse>({
      method: 'GET',
      url: 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=false',
      headers: { 'User-Agent': 'SakuraBot/1.0' },
    });
    if (data?.routes && data.routes[0]) {
      return { km: data.routes[0].distance / 1000, min: Math.round(data.routes[0].duration / 60) };
    }
    return null;
  }
}
