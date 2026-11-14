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

// Imagem de cabeçalho da saudação do bot: logo sem fundo no centro de uma faixa na cor da marca
// (proporção 1,91:1, a que o WhatsApp mostra inteira no topo da mensagem). JPEG, porque o cabeçalho
// de mensagem interativa só aceita JPEG ou PNG e transparência ali fica preta em alguns aparelhos.
export const BRAND_HEADER = {
  width: 1200,
  height: 628,
  logoMaxWidth: 760,
  logoMaxHeight: 500,
  defaultBackground: '#ffffff',
  quality: 85,
  contentType: 'image/jpeg',
  fileName: 'cabecalho.jpg',
} as const

/** URL pública do cabeçalho da saudação; a versão muda com o logo e com a cor. Null sem logo. */
export function brandHeaderUrl(
  publicApiUrl: string,
  establishmentId: string,
  logo: string | null | undefined,
  primaryColor: string | null | undefined
): string | null {
  if (typeof logo !== 'string' || logo.trim() === '') return null
  const baseUrl = publicApiUrl.replace(/\/$/, '')
  const version = brandLogoVersion(logo.trim() + '|' + (primaryColor ?? '').trim())
  return `${baseUrl}/public/branding/${establishmentId}/${BRAND_HEADER.fileName}?v=${version}`
}
