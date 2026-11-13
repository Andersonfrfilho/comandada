/** Preço de nota fiscal muda devagar; o custo aqui é a lentidão da SEFAZ, não o frescor. */
export const REGIONAL_PRICE_TTL_SECONDS = {
  HIT: 60 * 60 * 12,
  MISS: 60 * 60 * 2,
} as const

export const REGIONAL_PRICE_CACHE_PREFIX = 'regional-price:'

export const REGIONAL_PRICE_EMPTY_MARKER = '__none__'

/** Portais estaduais de NFC-e são lentos — timeout curto demais nunca traz resposta. */
export const REGIONAL_PRICE_TIMEOUT_MS = 8000

export const REGIONAL_PRICE_DEFAULT_RADIUS_KM = 5

export const REGIONAL_PRICE_MAX_RADIUS_KM = 15

/** Amostra pequena não representa "a região" — abaixo disso o número engana mais do que informa. */
export const REGIONAL_PRICE_MIN_SAMPLE = 3
