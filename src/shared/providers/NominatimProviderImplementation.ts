class NominatimProviderImplementation implements GeocodingProvider {
  constructor(private readonly http: HttpClientProvider) {}

  async search(query: string): Promise<NominatimResult | null> {
    const data = await this.http.request<NominatimResult[]>({
      method: 'GET',
      url: 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) + '&format=json&limit=1&countrycodes=br',
      headers: { 'User-Agent': 'SakuraBot/1.0' },
    });
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  }

  async reverse(lat: number, lng: number): Promise<NominatimReverseResult | null> {
    return this.http.request<NominatimReverseResult>({
      method: 'GET',
      url: 'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=pt-BR',
      headers: { 'User-Agent': 'SakuraBot/1.0' },
    });
  }
}
