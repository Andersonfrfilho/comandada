import sharp from 'sharp'
import { BRAND_HEADER, BRAND_STICKER, brandLogoVersion } from '../../shared/brandSticker.constant'
import { removeLogoBackground } from './removeLogoBackground'

export interface BrandSticker {
  version: string
  webp: Buffer
}

export interface BrandHeaderImage {
  version: string
  jpeg: Buffer
}

interface LogoSource {
  forEstablishment(establishmentId: string): Promise<{ logo: string | null; primaryColor?: string | null } | null>
}

const DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i

// Transforma o logo do restaurante (Configurações → Marca) na figurinha da saudação do bot.
// O resultado fica em memória por restaurante e só é refeito quando o logo muda.
export class BrandStickerService {
  private readonly cache = new Map<string, BrandSticker>()
  private readonly headerCache = new Map<string, BrandHeaderImage>()

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

  // Cabeçalho da saudação (logo na faixa da cor da marca); refeito quando o logo ou a cor mudam.
  async headerForEstablishment(establishmentId: string): Promise<BrandHeaderImage | null> {
    const branding = await this.branding.forEstablishment(establishmentId)
    const logo = branding?.logo?.trim()
    if (!logo) return null
    const primaryColor = branding?.primaryColor?.trim() ?? ''
    const version = brandLogoVersion(logo + '|' + primaryColor)
    const cached = this.headerCache.get(establishmentId)
    if (cached && cached.version === version) return cached
    const header = { version, jpeg: await toHeaderJpeg(await this.readLogo(logo), primaryColor) }
    this.headerCache.set(establishmentId, header)
    return header
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
export async function toStickerWebp(logo: Buffer): Promise<Buffer> {
  // Logo salvo antes da remoção automática ainda pode ter fundo liso: some aqui também.
  const image = await removeLogoBackground(logo)
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

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** Logo sem fundo, centralizado numa faixa 1200x628 na cor da marca (branco sem cor válida). */
export async function toHeaderJpeg(logo: Buffer, primaryColor: string | null | undefined): Promise<Buffer> {
  const image = await removeLogoBackground(logo)
  const fittedLogo = await sharp(image)
    .resize(BRAND_HEADER.logoMaxWidth, BRAND_HEADER.logoMaxHeight, { fit: 'inside' })
    .png()
    .toBuffer()
  const background = primaryColor && HEX_COLOR_PATTERN.test(primaryColor.trim()) ? primaryColor.trim() : BRAND_HEADER.defaultBackground
  return sharp({ create: { width: BRAND_HEADER.width, height: BRAND_HEADER.height, channels: 3, background } })
    .composite([{ input: fittedLogo, gravity: 'center' }])
    .jpeg({ quality: BRAND_HEADER.quality })
    .toBuffer()
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

async function fetchRemoteImage(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Logo indisponível (${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}
