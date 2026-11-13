export const PRODUCT_LOOKUP_CACHE_PREFIX = {
  BARCODE: 'product-lookup:barcode:',
  SEARCH: 'product-lookup:search:',
} as const

// Nome, marca e imagem de um item embalado praticamente não mudam, então o TTL de
// acerto é longo. O de "não encontrado" é curto de propósito: item ausente hoje pode
// entrar na base amanhã, e um miss de 7 dias congelaria essa correção.
export const PRODUCT_LOOKUP_TTL_SECONDS = {
  HIT: 60 * 60 * 24 * 7,
  MISS: 60 * 60 * 6,
} as const

/** Marcador de miss no cache — string vazia seria indistinguível de chave ausente. */
export const PRODUCT_LOOKUP_EMPTY_MARKER = '__none__'

/** Catálogo não pode parar de abrir porque a base externa ficou lenta. */
export const PRODUCT_LOOKUP_TIMEOUT_MS = 4000

export const PRODUCT_LOOKUP_MIN_QUERY_LENGTH = 2
