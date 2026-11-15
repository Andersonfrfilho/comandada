// Formatação da tela de detalhe do pedido: dinheiro, telefone, distância e links do Google Maps.

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const KM_FORMATTER = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** "135.00" → "R$ 135,00" (espaço comum: o Intl usa espaço não separável, que quebra busca e teste). */
export function formatBrl(value: string | number | null | undefined): string {
  const amount = typeof value === 'number' ? value : parseFloat(value ?? '')
  return BRL_FORMATTER.format(Number.isFinite(amount) ? amount : 0).replace(/\u00a0/g, ' ')
}

/** "5516993056772" → "(16) 99305-6772". Número fora do padrão brasileiro volta como veio. */
export function formatPhoneBr(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  const national = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`
  return raw ?? ''
}

const LOCATION_NOTE_PATTERN = /^\s*Localiza[çc][ãa]o:\s*(https?:\/\/\S+)\s*$/i

/**
 * Pedido antigo do bot guarda "Localização: <link do Maps>" na observação. O link vira o mapa da entrega;
 * a observação fica só com o que a equipe ou o cliente escreveu.
 */
export function splitLocationNote(notes: string | null | undefined): { notes: string | null; mapsLink: string | null } {
  if (!notes) return { notes: null, mapsLink: null }
  let mapsLink: string | null = null
  const kept = notes.split('\n').filter((line) => {
    const match = LOCATION_NOTE_PATTERN.exec(line)
    if (match && !mapsLink) {
      mapsLink = match[1] ?? null
      return false
    }
    return true
  })
  const remaining = kept.join('\n').trim()
  return { notes: remaining || null, mapsLink }
}

export interface MapPoint {
  lat: number
  lng: number
}

function placeQuery(address: string, point: MapPoint | null | undefined): string {
  return point ? `${point.lat},${point.lng}` : address
}

export function googleMapsSearchUrl(address: string, point?: MapPoint | null): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQuery(address, point))}`
}

/** Mapa embutido sem chave de API (iframe). Com o ponto geocodificado, o pin fica exato. */
export function googleMapsEmbedUrl(address: string, point?: MapPoint | null): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(placeQuery(address, point))}&z=15&output=embed`
}

/** Rota de carro do restaurante até o cliente; sem origem, o Maps parte de onde o aparelho está. */
export function googleMapsDirectionsUrl(address: string, destination?: MapPoint | null, origin?: MapPoint | null): string {
  const params = new URLSearchParams({ api: '1', destination: placeQuery(address, destination), travelmode: 'driving' })
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** 4.25 → "4,3 km"; abaixo de 1 km em metros ("850 m"). */
export function formatDistance(distanceKm: number | string | null | undefined): string | null {
  const km = typeof distanceKm === 'number' ? distanceKm : parseFloat(distanceKm ?? '')
  if (!Number.isFinite(km) || km < 0) return null
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  return `${KM_FORMATTER.format(km)} km`
}

/** 9 → "9 min"; 75 → "1 h 15 min". */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return null
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}
