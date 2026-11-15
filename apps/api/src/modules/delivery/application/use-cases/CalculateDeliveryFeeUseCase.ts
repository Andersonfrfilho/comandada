import type { BotConfigRepository, DeliveryFeeRuleRow } from '@/infra/database/BotConfigRepository'
import type { GeocodingProvider } from '@/shared/providers/GeocodingProvider'

interface CalculateDeliveryFeeInput {
  address: string
  /** Soma dos itens: libera o frete grátis da regra (`free_above`), como o bot já fazia. */
  itemsTotal?: number | undefined
}

export interface CalculateDeliveryFeeResult {
  feeAmount: number
  distanceKm: number | null
}

export interface DeliveryFeeQuote extends CalculateDeliveryFeeResult {
  /** Sem regra de taxa ativa: a taxa sai zero e o painel pede para digitar. */
  ruleConfigured: boolean
  freeShipping: boolean
  /** Endereço além do raio máximo da regra (o bot recusa; o painel avisa). */
  outOfRange: boolean
  maxRadiusKm: number | null
  freeAbove: number | null
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
    const quote = await this.quote(input)
    return { feeAmount: quote.feeAmount, distanceKm: quote.distanceKm }
  }

  /** Taxa com as mesmas regras do bot: frete grátis acima do valor e raio máximo. */
  async quote(input: CalculateDeliveryFeeInput): Promise<DeliveryFeeQuote> {
    const rule = await this.botConfigRepository.getActiveDeliveryFeeRule()
    if (!rule) {
      return { feeAmount: 0, distanceKm: null, ruleConfigured: false, freeShipping: false, outOfRange: false, maxRadiusKm: null, freeAbove: null }
    }
    const base = await this.feeForRule(rule, input.address)
    const freeAbove = rule.freeAbove > 0 ? rule.freeAbove : null
    const maxRadiusKm = rule.maxRadiusKm > 0 ? rule.maxRadiusKm : null
    const freeShipping = freeAbove !== null && (input.itemsTotal ?? 0) >= freeAbove
    const outOfRange = maxRadiusKm !== null && base.distanceKm !== null && base.distanceKm > maxRadiusKm
    return {
      feeAmount: freeShipping ? 0 : Math.round(base.feeAmount * 100) / 100,
      distanceKm: base.distanceKm === null ? null : Math.round(base.distanceKm * 10) / 10,
      ruleConfigured: true,
      freeShipping,
      outOfRange,
      maxRadiusKm,
      freeAbove,
    }
  }

  private async feeForRule(rule: DeliveryFeeRuleRow, address: string): Promise<CalculateDeliveryFeeResult> {
    // per_route_min/zones_min dependem de tempo de rota, que exige uma API de roteamento não
    // integrada ainda — cai para a taxa base até essa integração existir.
    if (rule.mode === 'per_route_min' || rule.mode === 'zones_min') {
      return { feeAmount: rule.baseFee, distanceKm: null }
    }

    if (rule.mode === 'fixed') {
      return { feeAmount: rule.baseFee, distanceKm: null }
    }

    const establishmentCoordinates = await this.botConfigRepository.getEstablishmentCoordinates()
    // Mapa fora do ar não derruba o pedido: fica a taxa base.
    const destination = await this.geocodingProvider.search(address).catch(() => null)
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
