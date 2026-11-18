import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const PRODUCT_IMAGE = {
  contentType: 'image/webp',
  fileName: 'foto.webp',
  /** Lado maior da foto guardada: cabe no card do cardápio em tela retina sem pesar no celular. */
  maxSide: 800,
  quality: 80,
  /** Arquivo enviado pelo painel antes da redução (foto de celular costuma ter 3-6 MB). */
  maxUploadBytes: 12 * 1024 * 1024,
} as const

export interface PreparedProductImage {
  content: Buffer
  version: string
}

const DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i

/** Aceita data URL (`data:image/jpeg;base64,...`) ou base64 puro, como o painel manda o logo. */
export function decodeImagePayload(payload: string): Buffer {
  const base64 = payload.trim().replace(DATA_URL_PATTERN, '')
  return Buffer.from(base64, 'base64')
}

/**
 * Reduz e padroniza a foto (WebP, no máximo 800 px no lado maior, rotação do EXIF aplicada, metadados fora).
 * A versão é o hash do resultado: a URL pública muda junto com a foto e pode ficar em cache para sempre.
 */
export async function prepareProductImage(input: Buffer): Promise<PreparedProductImage> {
  const content = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: PRODUCT_IMAGE.maxSide, height: PRODUCT_IMAGE.maxSide, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .webp({ quality: PRODUCT_IMAGE.quality })
    .toBuffer()
  const version = createHash('sha256').update(content).digest('hex').slice(0, 12)
  return { content, version }
}

/** Caminho público da foto (sem host): o painel e o cardápio online juntam com a URL da API. */
export function productImagePath(productId: string, imageVersion: string | null | undefined): string | null {
  if (!imageVersion) return null
  return `/public/products/${productId}/${PRODUCT_IMAGE.fileName}?v=${imageVersion}`
}
