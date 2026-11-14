import sharp from 'sharp'
import { BRAND_STICKER, brandLogoVersion } from '../../shared/brandSticker.constant'

export interface BrandSticker {
  version: string
  webp: Buffer
}

interface LogoSource {
  forEstablishment(establishmentId: string): Promise<{ logo: string | null } | null>
}

const DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i

// Transforma o logo do restaurante (Configurações → Marca) na figurinha da saudação do bot.
// O resultado fica em memória por restaurante e só é refeito quando o logo muda.
export class BrandStickerService {
  private readonly cache = new Map<string, BrandSticker>()

  constructor(
    private readonly branding: LogoSource,
    private readonly fetchImage: (url: string) => Promise<Buffer> = fetchRemoteImage
  ) {}

  async forEstablishment(establishmentId: string): Promise<BrandSticker | null> {
    const branding = await this.branding.forEstablishment(establishmentId)
    const logo = branding?.logo?.trim()
    if (!logo) return null
    const version = brandLogoVersion(logo)
    const cached = this.cache.get(establishmentId)
    if (cached && cached.version === version) return cached
    const sticker = { version, webp: await toStickerWebp(await this.readLogo(logo)) }
    this.cache.set(establishmentId, sticker)
    return sticker
  }

  private async readLogo(logo: string): Promise<Buffer> {
    const dataUrlMatch = DATA_URL_PATTERN.exec(logo)
    if (dataUrlMatch?.[1]) return Buffer.from(dataUrlMatch[1], 'base64')
    if (/^https?:\/\//i.test(logo)) return this.fetchImage(logo)
    throw new Error('Logo em formato desconhecido')
  }
}

/**
 * Logo centralizado num quadrado transparente de 512 px, comprimido até caber em 100 KB.
 * Logo cheio de detalhe que não cabe nem na menor qualidade perde nitidez (desenhado menor e ampliado).
 */
export async function toStickerWebp(image: Buffer): Promise<Buffer> {
  let detailSize: number = BRAND_STICKER.size
  while (detailSize >= BRAND_STICKER.minDetailSize) {
    const square = await sharp(image)
      .resize(detailSize, detailSize, { fit: 'contain', background: TRANSPARENT })
      .resize(BRAND_STICKER.size, BRAND_STICKER.size)
      .ensureAlpha()
      .png()
      .toBuffer()
    for (const quality of BRAND_STICKER.qualitySteps) {
      const webp = await sharp(square).webp({ quality, effort: 6 }).toBuffer()
      if (webp.length <= BRAND_STICKER.maxBytes) return webp
    }
    detailSize = Math.floor(detailSize / 2)
  }
  throw new Error('Logo não coube no limite de 100 KB da figurinha')
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

async function fetchRemoteImage(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Logo indisponível (${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}
