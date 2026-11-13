import type { GeocodingProvider, GeocodingResult } from './GeocodingProvider'

const NOMINATIM_USER_AGENT = 'SakuraBotOficial/1.0'

type NominatimResult = {
  lat: string
  lon: string
}

export class NominatimProvider implements GeocodingProvider {
  async search(query: string): Promise<GeocodingResult | null> {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`
    const response = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    })
    if (!response.ok) return null
    const data = (await response.json()) as NominatimResult[]
    const result = data[0]
    if (!result) return null
    return { lat: Number(result.lat), lng: Number(result.lon) }
  }
}
