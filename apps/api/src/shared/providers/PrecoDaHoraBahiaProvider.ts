import type { GeocodingProvider } from './GeocodingProvider'
import type {
  RegionalPriceProvider,
  RegionalPriceQuery,
  RegionalPriceQuote,
} from './RegionalPriceProvider'
import { regionalPriceQuoteSchema } from './RegionalPriceProvider'
import {
  REGIONAL_PRICE_MIN_SAMPLE,
  REGIONAL_PRICE_TIMEOUT_MS,
} from '@/shared/constants/regionalPrice.constant'

const SOURCE_NAME = 'precodahora-ba'
const STATE = 'BA'
const SEARCH_URL = 'https://precodahora.ba.gov.br/produtos/'
const CSRF_FIELD_PATTERN = /name="csrf_token"[^>]*value="([^"]+)"/

type PrecoDaHoraItem = {
  produto?: {
    precoUnitario?: number | string
    data?: string
  }
}

type PrecoDaHoraResponse = {
  resultado?: PrecoDaHoraItem[]
}

type Session = {
  csrfToken: string
  cookie: string
}

type Sample = {
  price: number
  collectedAt: Date
}

/** A média de floats vira dízima; preço exibido na tela não pode ter 14 casas. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * "Preço da Hora Bahia" — programa de transparência de NFC-e da SEFAZ/BA.
 *
 * Cobre **apenas a BA**: é o piloto da T4.4, não uma base nacional. O portal exige
 * sessão com CSRF e coordenada geográfica, então a consulta é uma sequência de três
 * passos (sessão → geocodificação do CEP → busca), tem limite de requisição por IP e
 * qualquer etapa pode falhar. Indisponibilidade devolve `null`, nunca erro ao usuário.
 */
export class PrecoDaHoraBahiaProvider implements RegionalPriceProvider {
  readonly name = SOURCE_NAME
  readonly state = STATE

  constructor(private readonly geocoding: GeocodingProvider) {}

  /** O token de CSRF vem num input escondido do HTML, não em cabeçalho nem em cookie. */
  private async openSession(): Promise<Session | null> {
    try {
      const response = await fetch(SEARCH_URL, {
        signal: AbortSignal.timeout(REGIONAL_PRICE_TIMEOUT_MS),
      })
      if (!response.ok) return null

      const rawCookie = response.headers.get('set-cookie')
      if (!rawCookie) return null
      const cookie = rawCookie
        .split(', ')
        .map((piece) => piece.split(';')[0])
        .join('; ')

      const csrfToken = CSRF_FIELD_PATTERN.exec(await response.text())?.[1]
      if (!csrfToken) return null

      return { csrfToken, cookie }
    } catch {
      return null
    }
  }

  private async fetchItems(
    query: RegionalPriceQuery,
    coordinates: { lat: number; lng: number }
  ): Promise<PrecoDaHoraItem[]> {
    const session = await this.openSession()
    if (!session) return []

    const body = new URLSearchParams({
      gtin: query.barcode,
      local: JSON.stringify({ latitude: coordinates.lat, longitude: coordinates.lng }),
      raio: String(query.radiusKm),
      pagina: '1',
      ordenar: 'preco.asc',
    })

    try {
      const response = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRFToken': session.csrfToken,
          Cookie: session.cookie,
          Referer: SEARCH_URL,
        },
        body,
        signal: AbortSignal.timeout(REGIONAL_PRICE_TIMEOUT_MS),
      })
      // 429 é resposta comum aqui — o portal limita por IP, e o cache existe por isso.
      if (!response.ok) return []

      const data = (await response.json()) as PrecoDaHoraResponse
      return data.resultado ?? []
    } catch {
      return []
    }
  }

  private toSample(item: PrecoDaHoraItem): Sample | null {
    const price = Number(item.produto?.precoUnitario)
    if (!Number.isFinite(price) || price <= 0) return null

    const rawDate = item.produto?.data
    const collectedAt = rawDate ? new Date(rawDate.replace(' ', 'T')) : null
    if (!collectedAt || Number.isNaN(collectedAt.getTime())) return null

    return { price, collectedAt }
  }

  private async resolveCoordinates(
    postalCode: string
  ): Promise<{ lat: number; lng: number } | null> {
    try {
      return await this.geocoding.search(`${postalCode}, Bahia, Brasil`)
    } catch {
      return null
    }
  }

  async getQuote(query: RegionalPriceQuery): Promise<RegionalPriceQuote | null> {
    const coordinates = await this.resolveCoordinates(query.postalCode)
    if (!coordinates) return null

    const samples = (await this.fetchItems(query, coordinates))
      .map((item) => this.toSample(item))
      .filter((sample): sample is Sample => sample !== null)

    if (samples.length < REGIONAL_PRICE_MIN_SAMPLE) return null

    const prices = samples.map((sample) => sample.price)
    const mostRecent = samples.reduce((latest, sample) =>
      sample.collectedAt > latest.collectedAt ? sample : latest
    )

    const parsed = regionalPriceQuoteSchema.safeParse({
      minPrice: toCents(Math.min(...prices)),
      averagePrice: toCents(prices.reduce((total, price) => total + price, 0) / prices.length),
      maxPrice: toCents(Math.max(...prices)),
      sampleCount: samples.length,
      collectedAt: mostRecent.collectedAt.toISOString(),
      state: STATE,
      source: SOURCE_NAME,
    })
    return parsed.success ? parsed.data : null
  }
}
