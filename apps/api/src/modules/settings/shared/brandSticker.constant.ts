import { createHash } from 'crypto'

// Figurinha do WhatsApp: WebP quadrado de 512 px, estática com no máximo 100 KB (regra da Meta).
export const BRAND_STICKER = {
  size: 512,
  maxBytes: 100 * 1024,
  qualitySteps: [90, 75, 60, 45, 30, 15],
  minDetailSize: 64,
  contentType: 'image/webp',
  fileName: 'sticker.webp',
} as const

/** Versão curta do logo: muda quando o restaurante troca o logo, e com ela a URL da figurinha. */
export function brandLogoVersion(logo: string): string {
  return createHash('sha256').update(logo).digest('hex').slice(0, 12)
}

/** URL pública da figurinha do restaurante, ou null quando ele não tem logo. */
export function brandStickerUrl(publicApiUrl: string, establishmentId: string, logo: string | null | undefined): string | null {
  if (typeof logo !== 'string' || logo.trim() === '') return null
  const baseUrl = publicApiUrl.replace(/\/$/, '')
  return `${baseUrl}/public/branding/${establishmentId}/${BRAND_STICKER.fileName}?v=${brandLogoVersion(logo.trim())}`
}
