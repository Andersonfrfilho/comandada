import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { GeocodingProvider } from '@/shared/providers/GeocodingProvider'
import {
  ESTABLISHMENT_LOCATION_SETTING_KEYS as KEYS,
  GEOCODING_RETRY_AFTER_MS,
  GEOCODING_TIMEOUT_MS,
  geocodingQuery,
} from '../../shared/establishmentLocation.constant'

type Database = NodePgDatabase<typeof schema>

export interface EstablishmentCoordinates {
  latitude: number
  longitude: number
}

// Coordenadas do restaurante para o card de localização da saudação. Vêm do endereço em
// Configurações (geocodificado uma vez e salvo) ou de latitude/longitude digitadas no painel.
export class EstablishmentLocationService {
  private readonly failedQueries = new Map<string, number>()

  constructor(
    private readonly db: Database,
    private readonly geocoding: GeocodingProvider,
    private readonly now: () => number = Date.now
  ) {}

  /** Recebe as configurações já carregadas (chave → texto) e devolve as coordenadas, geocodificando se preciso. */
  async resolve(establishmentId: string, config: Record<string, string>): Promise<EstablishmentCoordinates | null> {
    const address = (config[KEYS.address] ?? '').trim()
    const query = address ? geocodingQuery(address, config[KEYS.city] ?? '') : ''
    const saved = parseCoordinates(config[KEYS.latitude], config[KEYS.longitude])
    const geocodedFor = config[KEYS.geocodedFor]
    const typedByHand = saved && !geocodedFor
    if (typedByHand) return saved
    if (!query) return null
    if (saved && geocodedFor === query) return saved
    return this.geocode(establishmentId, query)
  }

  private async geocode(establishmentId: string, query: string): Promise<EstablishmentCoordinates | null> {
    const failedAt = this.failedQueries.get(query)
    if (failedAt !== undefined && this.now() - failedAt < GEOCODING_RETRY_AFTER_MS) return null
    const result = await withTimeout(this.geocoding.search(query), GEOCODING_TIMEOUT_MS).catch(() => null)
    if (!result || !Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
      this.failedQueries.set(query, this.now())
      return null
    }
    await this.save(establishmentId, {
      [KEYS.latitude]: String(result.lat),
      [KEYS.longitude]: String(result.lng),
      [KEYS.geocodedFor]: query,
    })
    return { latitude: result.lat, longitude: result.lng }
  }

  private async save(establishmentId: string, values: Record<string, string>): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction
        .delete(schema.settings)
        .where(and(eq(schema.settings.establishmentId, establishmentId), inArray(schema.settings.key, Object.keys(values))))
      await transaction
        .insert(schema.settings)
        .values(Object.entries(values).map(([key, value]) => ({ establishmentId, key, value, updatedAt: new Date() })))
    })
  }
}

function parseCoordinates(latitude: string | undefined, longitude: string | undefined): EstablishmentCoordinates | null {
  const lat = Number(stripJsonQuotes(latitude))
  const lng = Number(stripJsonQuotes(longitude))
  if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null
  return { latitude: lat, longitude: lng }
}

// Valor numérico salvo como jsonb número chega como "-20.5"; salvo como texto JSON chega igual. Só por garantia.
function stripJsonQuotes(value: string | undefined): string {
  return (value ?? '').replace(/^"|"$/g, '').trim()
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), milliseconds)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
