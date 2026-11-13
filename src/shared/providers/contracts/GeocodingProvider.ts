interface GeocodingProvider {
  search(query: string): Promise<NominatimResult | null>;
  reverse(lat: number, lng: number): Promise<NominatimReverseResult | null>;
}
