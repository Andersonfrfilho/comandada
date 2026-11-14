// Chaves da tabela settings com o endereço e as redes do restaurante, usadas pela saudação do bot.
export const ESTABLISHMENT_LOCATION_SETTING_KEYS = {
  address: 'establishment_address',
  city: 'establishment_city',
  latitude: 'establishment_lat',
  longitude: 'establishment_lng',
  // Endereço que gerou as coordenadas automáticas. Sem ele, lat/lng foram digitadas e valem como estão.
  geocodedFor: 'establishment_geocoded_for',
} as const

// Nominatim pede no máximo uma consulta por segundo; um endereço que não achou só é tentado de novo depois disto.
export const GEOCODING_RETRY_AFTER_MS = 60 * 60 * 1000
export const GEOCODING_TIMEOUT_MS = 4000

/** Texto que vai para o geocoder: endereço + cidade, sem o travessão que separa o bairro. */
export function geocodingQuery(address: string, city: string): string {
  return [address.replace(/\s*[—–]\s*/g, ', '), city].map((part) => part.trim()).filter(Boolean).join(', ')
}
