export type GeocodingResult = {
  readonly lat: number
  readonly lng: number
}

export interface GeocodingProvider {
  search(query: string): Promise<GeocodingResult | null>
}
