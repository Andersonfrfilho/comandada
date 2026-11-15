import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import type { GeocodingProvider, GeocodingResult } from '@/shared/providers/GeocodingProvider'
import type { RoutingProvider, RouteResult } from '@/shared/providers/RoutingProvider'
import type { EstablishmentLocationService } from '@/modules/settings/application/services/EstablishmentLocationService'

type Database = NodePgDatabase<typeof schema>

export interface RoutePoint {
  lat: number
  lng: number
}

/**
 * Trajeto do restaurante até o endereço de entrega, para o mapa da tela de detalhe do pedido.
 * `source`: `route` = rota de carro (OSRM); `straight_line` = só a distância em linha reta (roteador fora);
 * `null` = endereço ou restaurante sem coordenadas.
 */
export interface OrderRoute {
  origin: RoutePoint | null
  destination: RoutePoint | null
  distanceKm: number | null
  durationMin: number | null
  source: 'route' | 'straight_line' | null
}

const EXTERNAL_TIMEOUT_MS = 4000
// Endereço de pedido não muda; cada consulta ao Nominatim/OSRM custa ~1 s e eles pedem moderação.
const CACHE_MAX_ENTRIES = 500
const EARTH_RADIUS_KM = 6371

const EMPTY_ROUTE: OrderRoute = { origin: null, destination: null, distanceKm: null, durationMin: null, source: null }

export class GetOrderRouteUseCase {
  private readonly cache = new Map<string, OrderRoute>()

  constructor(
    private readonly db: Database,
    private readonly establishmentLocation: Pick<EstablishmentLocationService, 'resolve'>,
    private readonly geocoding: GeocodingProvider,
    private readonly routing: RoutingProvider
  ) {}

  async execute(orderId: string, establishmentId: string): Promise<OrderRoute> {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderId), eq(schema.orders.establishmentId, establishmentId)),
      with: { delivery: true },
    })
    if (!order) throw new NotFoundError('Order')

    const snapshot = order.delivery[0]?.addressSnapshot as { address?: string } | undefined
    const address = snapshot?.address?.trim()
    if (!address) return EMPTY_ROUTE

    const config = await this.loadConfig(establishmentId)
    const establishmentCoordinates = await this.establishmentLocation.resolve(establishmentId, config).catch(() => null)
    const origin = establishmentCoordinates
      ? { lat: establishmentCoordinates.latitude, lng: establishmentCoordinates.longitude }
      : null

    const cacheKey = `${origin?.lat ?? ''},${origin?.lng ?? ''}|${address}`
    const cached = this.cache.get(cacheKey)
    if (cached) return cached

    const destinationResult = await withTimeout(this.geocoding.search(address), EXTERNAL_TIMEOUT_MS).catch(() => null)
    const destination = isValidPoint(destinationResult) ? { lat: destinationResult.lat, lng: destinationResult.lng } : null

    const route = await buildRoute(origin, destination, this.routing)
    // Falha de geocodificação não fica em cache: o Nominatim pode só ter recusado por limite.
    if (route.destination) this.remember(cacheKey, route)
    return route
  }

  private remember(key: string, route: OrderRoute): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) this.cache.delete(oldestKey)
    }
    this.cache.set(key, route)
  }

  private async loadConfig(establishmentId: string): Promise<Record<string, string>> {
    const rows = await this.db.query.settings.findMany({ where: eq(schema.settings.establishmentId, establishmentId) })
    return Object.fromEntries(
      rows.map((row) => [row.key, typeof row.value === 'string' ? row.value : JSON.stringify(row.value)])
    )
  }
}

export async function buildRoute(
  origin: RoutePoint | null,
  destination: RoutePoint | null,
  routing: RoutingProvider
): Promise<OrderRoute> {
  if (!origin || !destination) {
    return { origin, destination, distanceKm: null, durationMin: null, source: null }
  }
  const drive: RouteResult | null = await withTimeout(
    routing.route(origin.lat, origin.lng, destination.lat, destination.lng),
    EXTERNAL_TIMEOUT_MS
  ).catch(() => null)
  if (drive && Number.isFinite(drive.km)) {
    return { origin, destination, distanceKm: round(drive.km, 1), durationMin: Math.max(1, Math.round(drive.min)), source: 'route' }
  }
  return {
    origin,
    destination,
    distanceKm: round(haversineKm(origin, destination), 1),
    durationMin: null,
    source: 'straight_line',
  }
}

export function haversineKm(from: RoutePoint, to: RoutePoint): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(to.lat - from.lat)
  const deltaLng = toRadians(to.lng - from.lng)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(deltaLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function isValidPoint(result: GeocodingResult | null): result is GeocodingResult {
  return Boolean(result) && Number.isFinite(result?.lat) && Number.isFinite(result?.lng)
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
