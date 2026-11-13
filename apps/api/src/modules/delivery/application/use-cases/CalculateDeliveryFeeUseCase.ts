import type { BotConfigRepository, DeliveryFeeRuleRow } from '@/infra/database/BotConfigRepository'
import type { GeocodingProvider } from '@/shared/providers/GeocodingProvider'

interface CalculateDeliveryFeeInput {
  address: string
}

export interface CalculateDeliveryFeeResult {
  feeAmount: number
  distanceKm: number | null
}

const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function calculateHaversineDistanceKm(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number
): number {
  const deltaLat = toRadians(destinationLat - originLat)
  const deltaLng = toRadians(destinationLng - originLng)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(originLat)) * Math.cos(toRadians(destinationLat)) * Math.sin(deltaLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

function calculateFeeForDistance(rule: DeliveryFeeRuleRow, distanceKm: number): number {
  if (rule.mode === 'per_km') {
    return rule.baseFee + distanceKm * rule.perKmRate
  }
  if (rule.mode === 'zones_km') {
    const zone = rule.zones.find((item) => distanceKm >= item.minValue && distanceKm < item.maxValue)
    if (zone) return zone.fee
  }
  return rule.baseFee
}

export class CalculateDeliveryFeeUseCase {
  constructor(
    private readonly botConfigRepository: BotConfigRepository,
    private readonly geocodingProvider: GeocodingProvider
  ) {}

  async execute(input: CalculateDeliveryFeeInput): Promise<CalculateDeliveryFeeResult> {
    const rule = await this.botConfigRepository.getActiveDeliveryFeeRule()
    if (!rule) return { feeAmount: 0, distanceKm: null }

    // per_route_min/zones_min dependem de tempo de rota, que exige uma API de roteamento não
    // integrada ainda — cai para a taxa base até essa integração existir.
    if (rule.mode === 'per_route_min' || rule.mode === 'zones_min') {
      return { feeAmount: rule.baseFee, distanceKm: null }
    }

    if (rule.mode === 'fixed') {
      return { feeAmount: rule.baseFee, distanceKm: null }
    }

    const establishmentCoordinates = await this.botConfigRepository.getEstablishmentCoordinates()
    const destination = await this.geocodingProvider.search(input.address)
    if (!destination || (establishmentCoordinates.lat === 0 && establishmentCoordinates.lng === 0)) {
      return { feeAmount: rule.baseFee, distanceKm: null }
    }

    const distanceKm = calculateHaversineDistanceKm(
      establishmentCoordinates.lat,
      establishmentCoordinates.lng,
      destination.lat,
      destination.lng
    )

    const feeAmount = calculateFeeForDistance(rule, distanceKm)
    return { feeAmount, distanceKm }
  }
}
