import sharp from 'sharp'
import { removeLogoBackground } from '@/modules/settings/application/services/removeLogoBackground'
import type { PdfJpegImage, RgbColor } from '../../infra/pdf/SimplePdfDocument'
import { MENU_PDF, MENU_PDF_TEXT, menuContentVersion } from '../../shared/menuPdf.constant'
import { renderMenuPdf, type MenuPdfCategory, type MenuPdfItem } from './renderMenuPdf'

export interface MenuSourceProduct {
  name: string
  price: number
  description: string | null
  category: string
  variantGroup: string | null
  variantLabel: string | null
}

/** Tudo o que o PDF mostra, lido do cadastro do restaurante. */
export interface MenuSource {
  name: string
  whatsappNumber: string | null
  logo: string | null
  primaryColor: string | null
  address: string | null
  city: string | null
  instagram: string | null
  /** Já na ordem do cardápio (categoria, ordem do item, nome). */
  products: MenuSourceProduct[]
}

export interface MenuSourceReader {
  forEstablishment(establishmentId: string): Promise<MenuSource | null>
}

export interface MenuPdf {
  version: string
  pdf: Buffer
}

const DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i
const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i

/**
 * Cardápio completo em PDF, gerado do cadastro (produtos ativos, preços, descrição, logo e cor da
 * marca). Fica em memória por restaurante e só é refeito quando algo do conteúdo muda ou vira o dia.
 */
export class MenuPdfService {
  private readonly cache = new Map<string, MenuPdf>()

  constructor(
    private readonly source: MenuSourceReader,
    private readonly fetchImage: (url: string) => Promise<Buffer> = fetchRemoteImage,
    private readonly today: () => string = todayInSaoPaulo
  ) {}

  async forEstablishment(establishmentId: string): Promise<MenuPdf | null> {
    const source = await this.source.forEstablishment(establishmentId)
    if (!source) return null
    const updatedOn = this.today()
    const version = menuContentVersion({ source, updatedOn })
    const cached = this.cache.get(establishmentId)
    if (cached && cached.version === version) return cached

    const pdf = renderMenuPdf({
      establishmentName: source.name,
      contactLines: contactLinesOf(source),
      categories: groupMenuCategories(source.products),
      accentColor: parseHexColor(source.primaryColor) ?? parseHexColor(MENU_PDF.defaultAccentColor) ?? [0, 0, 0],
      logo: source.logo ? await this.logoAsJpeg(source.logo).catch(() => null) : null,
      updatedOn,
    })
    const menuPdf = { version, pdf }
    this.cache.set(establishmentId, menuPdf)
    return menuPdf
  }

  /** Logo sem o fundo liso, sobre branco (JPEG não tem transparência), com no máximo 256 px. */
  private async logoAsJpeg(logo: string): Promise<PdfJpegImage> {
    const dataUrlMatch = DATA_URL_PATTERN.exec(logo.trim())
    const original = dataUrlMatch?.[1] ? Buffer.from(dataUrlMatch[1], 'base64') : await this.fetchImage(logo.trim())
    const withoutBackground = await removeLogoBackground(original)
    const { data, info } = await sharp(withoutBackground)
      .resize(MENU_PDF.logoPixels, MENU_PDF.logoPixels, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88 })
      .toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  }
}

function contactLinesOf(source: MenuSource): string[] {
  const lines: string[] = []
  const address = [source.address, source.city].filter((part) => part && part.trim()).join(' - ')
  if (address) lines.push(address)
  const contacts: string[] = []
  if (source.whatsappNumber) contacts.push(MENU_PDF_TEXT.whatsapp(formatPhone(source.whatsappNumber)))
  if (source.instagram) contacts.push(MENU_PDF_TEXT.instagram(instagramHandle(source.instagram)))
  if (contacts.length > 0) lines.push(contacts.join('   ·   '))
  return lines
}

/** "5516999990000" → "(16) 99999-0000"; número fora do padrão sai como veio. */
export function formatPhone(number: string): string {
  const digits = number.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return number
}

function instagramHandle(value: string): string {
  const handle = value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '').replace(/^@/, '')
  return handle ? '@' + handle : value.trim()
}

function formatPrice(value: number): string {
  return 'R$ ' + value.toFixed(2).replace('.', ',')
}

/**
 * Mesma regra do bot: tamanhos do mesmo item (variant_group) viram uma linha só, com o nome sem
 * "(Médio)" e os preços lado a lado. A ordem das categorias e dos itens é a do cadastro.
 */
export function groupMenuCategories(products: MenuSourceProduct[]): MenuPdfCategory[] {
  const categories: MenuPdfCategory[] = []
  const categoryByName = new Map<string, MenuPdfCategory>()
  const variantsByGroup = new Map<string, { item: MenuPdfItem; variants: MenuSourceProduct[] }>()

  for (const product of products) {
    const categoryName = product.category || 'Outros'
    let category = categoryByName.get(categoryName)
    if (!category) {
      category = { name: categoryName, items: [] }
      categoryByName.set(categoryName, category)
      categories.push(category)
    }
    const groupKey = product.variantGroup ? `${categoryName}::${product.variantGroup}` : null
    const existingGroup = groupKey ? variantsByGroup.get(groupKey) : undefined
    if (existingGroup) {
      existingGroup.variants.push(product)
      existingGroup.item.priceText = existingGroup.variants
        .map((variant) => `${variant.variantLabel || variant.name} ${formatPrice(variant.price)}`)
        .join(' · ')
      if (!existingGroup.item.description && product.description) existingGroup.item.description = product.description
      continue
    }
    const item: MenuPdfItem = {
      name: product.variantLabel ? product.name.replace(/\s*\([^)]*\)\s*$/, '') : product.name,
      priceText: product.variantGroup && product.variantLabel
        ? `${product.variantLabel} ${formatPrice(product.price)}`
        : formatPrice(product.price),
      description: product.description?.trim() || null,
    }
    if (groupKey) variantsByGroup.set(groupKey, { item, variants: [product] })
    category.items.push(item)
  }
  return categories
}

export function parseHexColor(value: string | null | undefined): RgbColor | null {
  const match = HEX_COLOR_PATTERN.exec((value ?? '').trim())
  const hex = match?.[1]
  if (!hex) return null
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date())
}

async function fetchRemoteImage(url: string): Promise<Buffer> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Logo em formato desconhecido')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Logo indisponível (${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}
