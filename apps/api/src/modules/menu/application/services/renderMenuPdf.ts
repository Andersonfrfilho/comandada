import {
  PDF_PAGE_HEIGHT,
  PDF_PAGE_WIDTH,
  printableText,
  SimplePdfDocument,
  type PdfJpegImage,
  type PdfTextOptions,
  type RgbColor,
} from '../../infra/pdf/SimplePdfDocument'
import { MENU_PDF_TEXT } from '../../shared/menuPdf.constant'

export interface MenuPdfItem {
  name: string
  /** "R$ 39,90" ou, com tamanhos, "Médio R$ 37,00 · Grande R$ 49,00". */
  priceText: string
  description: string | null
}

export interface MenuPdfCategory {
  name: string
  items: MenuPdfItem[]
}

export interface MenuPdfContent {
  establishmentName: string
  contactLines: string[]
  categories: MenuPdfCategory[]
  accentColor: RgbColor
  logo: PdfJpegImage | null
  /** "14/11/2026": o cliente sabe que o cardápio é o de hoje. */
  updatedOn: string
}

const MARGIN = 40
const CONTENT_WIDTH = PDF_PAGE_WIDTH - MARGIN * 2
const FOOTER_TOP = PDF_PAGE_HEIGHT - 34
const BOTTOM_LIMIT = FOOTER_TOP - 18
const LOGO_SIZE = 64
const CATEGORY_BAR_HEIGHT = 24
const PRICE_COLUMN_MAX = CONTENT_WIDTH * 0.42

const TEXT_DARK: RgbColor = [34, 34, 34]
const TEXT_MUTED: RgbColor = [110, 110, 110]
const LEADER_COLOR: RgbColor = [190, 190, 190]
const WHITE: RgbColor = [255, 255, 255]

const NAME_STYLE: PdfTextOptions = { font: 'bold', size: 11.5, color: TEXT_DARK }
const PRICE_STYLE: PdfTextOptions = { font: 'bold', size: 11.5, color: TEXT_DARK }
const DESCRIPTION_STYLE: PdfTextOptions = { font: 'regular', size: 9, color: TEXT_MUTED }
const LINE_GAP = 3

/** Texto branco em cor clara não se lê: aí a barra da categoria leva texto escuro. */
function readableOn(background: RgbColor): RgbColor {
  const [red, green, blue] = background
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.62 ? TEXT_DARK : WHITE
}

/**
 * Cardápio em A4, uma coluna (lê bem no celular): cabeçalho com logo, nome e contato, e cada
 * categoria numa barra com a cor da marca, os itens com preço alinhado à direita e a descrição
 * embaixo. Todo rodapé ensina a pedir escrevendo ou por áudio.
 */
export function renderMenuPdf(content: MenuPdfContent): Buffer {
  const document = new SimplePdfDocument()
  let page = document.addPage()
  let cursor = drawHeader(document, page, content)

  const ensureSpace = (height: number): void => {
    if (cursor + height <= BOTTOM_LIMIT) return
    page = document.addPage()
    cursor = MARGIN + 6
  }

  const visibleCategories = content.categories.filter((category) => category.items.length > 0)
  if (visibleCategories.length === 0) {
    document.text(page, MENU_PDF_TEXT.empty, MARGIN, cursor + 16, { size: 12, color: TEXT_MUTED })
  }

  for (const category of visibleCategories) {
    // A barra nunca fica sozinha no pé da página: vai junto com pelo menos o primeiro item.
    ensureSpace(CATEGORY_BAR_HEIGHT + 44)
    cursor += 10
    document.rect(page, MARGIN, cursor, CONTENT_WIDTH, CATEGORY_BAR_HEIGHT, content.accentColor)
    document.text(page, printableText(category.name).toUpperCase(), MARGIN + 10, cursor + 16, {
      font: 'bold',
      size: 12,
      color: readableOn(content.accentColor),
    })
    cursor += CATEGORY_BAR_HEIGHT + 8

    for (const item of category.items) {
      const layout = layoutItem(document, item)
      ensureSpace(layout.height)
      drawItem(document, page, cursor, layout)
      cursor += layout.height
    }
  }

  const totalPages = document.pageCount
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    drawFooter(document, pageIndex, totalPages, content.accentColor, orderExampleOf(visibleCategories))
  }
  return document.toBuffer({ title: `${MENU_PDF_TEXT.title} - ${printableText(content.establishmentName)}` })
}

function drawHeader(document: SimplePdfDocument, page: number, content: MenuPdfContent): number {
  document.rect(page, 0, 0, PDF_PAGE_WIDTH, 8, content.accentColor)
  const top = MARGIN
  let textLeft = MARGIN
  if (content.logo) {
    const scale = Math.min(LOGO_SIZE / content.logo.width, LOGO_SIZE / content.logo.height)
    const width = content.logo.width * scale
    const height = content.logo.height * scale
    document.image(page, content.logo, MARGIN, top + (LOGO_SIZE - height) / 2, width, height)
    textLeft = MARGIN + LOGO_SIZE + 16
  }
  const textWidth = PDF_PAGE_WIDTH - MARGIN - textLeft
  const nameStyle: PdfTextOptions = { font: 'bold', size: 22, color: TEXT_DARK }
  const nameLines = document.wrap(content.establishmentName, textWidth, nameStyle).slice(0, 2)
  let line = top + 20
  for (const nameLine of nameLines) {
    document.text(page, nameLine, textLeft, line, nameStyle)
    line += 24
  }
  document.text(page, `${MENU_PDF_TEXT.title} · ${MENU_PDF_TEXT.updatedOn(content.updatedOn)}`, textLeft, line - 4, {
    font: 'bold',
    size: 10,
    color: content.accentColor,
  })
  line += 12
  for (const contactLine of content.contactLines) {
    for (const wrapped of document.wrap(contactLine, textWidth, { size: 9 })) {
      document.text(page, wrapped, textLeft, line, { size: 9, color: TEXT_MUTED })
      line += 12
    }
  }
  const bottom = Math.max(line, top + LOGO_SIZE + 8)
  document.line(page, { left: MARGIN, top: bottom }, { left: PDF_PAGE_WIDTH - MARGIN, top: bottom }, LEADER_COLOR, 0.8)
  return bottom + 4
}

interface ItemLayout {
  name: string[]
  price: string
  priceOnOwnLine: boolean
  description: string[]
  height: number
}

function layoutItem(document: SimplePdfDocument, item: MenuPdfItem): ItemLayout {
  const price = printableText(item.priceText)
  const priceWidth = document.textWidth(price, PRICE_STYLE)
  // Preço de vários tamanhos é comprido: desce para a linha de baixo em vez de espremer o nome.
  const priceOnOwnLine = priceWidth > PRICE_COLUMN_MAX
  const nameWidth = priceOnOwnLine ? CONTENT_WIDTH : CONTENT_WIDTH - priceWidth - 24
  const name = document.wrap(item.name, nameWidth, NAME_STYLE)
  const description = item.description ? document.wrap(item.description, CONTENT_WIDTH - 12, DESCRIPTION_STYLE) : []
  const nameHeight = name.length * (NAME_STYLE.size + LINE_GAP)
  const priceHeight = priceOnOwnLine ? PRICE_STYLE.size + LINE_GAP : 0
  const descriptionHeight = description.length * (DESCRIPTION_STYLE.size + LINE_GAP)
  return { name, price, priceOnOwnLine, description, height: nameHeight + priceHeight + descriptionHeight + 12 }
}

function drawItem(document: SimplePdfDocument, page: number, top: number, layout: ItemLayout): void {
  let baseline = top + NAME_STYLE.size
  layout.name.forEach((nameLine, index) => {
    document.text(page, nameLine, MARGIN, baseline, NAME_STYLE)
    const isLastNameLine = index === layout.name.length - 1
    if (isLastNameLine && !layout.priceOnOwnLine) {
      const priceWidth = document.textWidth(layout.price, PRICE_STYLE)
      const priceLeft = PDF_PAGE_WIDTH - MARGIN - priceWidth
      const nameEnd = MARGIN + document.textWidth(nameLine, NAME_STYLE) + 6
      if (priceLeft - 6 > nameEnd) {
        document.line(page, { left: nameEnd, top: baseline }, { left: priceLeft - 6, top: baseline }, LEADER_COLOR, 0.8, [1, 2.5])
      }
      document.text(page, layout.price, priceLeft, baseline, PRICE_STYLE)
    }
    baseline += NAME_STYLE.size + LINE_GAP
  })
  if (layout.priceOnOwnLine) {
    document.text(page, layout.price, MARGIN, baseline, { ...PRICE_STYLE, size: 10.5 })
    baseline += PRICE_STYLE.size + LINE_GAP
  }
  for (const descriptionLine of layout.description) {
    document.text(page, descriptionLine, MARGIN, baseline - 1, DESCRIPTION_STYLE)
    baseline += DESCRIPTION_STYLE.size + LINE_GAP
  }
}

/** Exemplo com itens do próprio cardápio, igual ao do bot: "2 combo tradicional e 1 carpaccio de salmão". */
export function orderExampleOf(categories: MenuPdfCategory[]): string {
  const firstItems = categories.map((category) => category.items[0]).filter((item): item is MenuPdfItem => !!item)
  const picks = firstItems.length >= 2 ? firstItems.slice(0, 2) : (categories[0]?.items ?? []).slice(0, 2)
  const names = picks.map((item) => printableText(item.name).toLowerCase())
  if (names.length === 0) return MENU_PDF_TEXT.fallbackExample
  return names.length === 1 ? `2 ${names[0]}` : `2 ${names[0]} e 1 ${names[1]}`
}

function drawFooter(document: SimplePdfDocument, page: number, totalPages: number, accentColor: RgbColor, example: string): void {
  document.line(page, { left: MARGIN, top: FOOTER_TOP - 12 }, { left: PDF_PAGE_WIDTH - MARGIN, top: FOOTER_TOP - 12 }, LEADER_COLOR, 0.6)
  const pageLabel = MENU_PDF_TEXT.page(page + 1, totalPages)
  const pageWidth = document.textWidth(pageLabel, { size: 9 })
  const hintStyle = { font: 'bold' as const, size: 9, color: accentColor }
  const hintLines = document.wrap(MENU_PDF_TEXT.howToOrder(example), CONTENT_WIDTH - pageWidth - 16, hintStyle).slice(0, 2)
  hintLines.forEach((line, index) => document.text(page, line, MARGIN, FOOTER_TOP + index * 11, hintStyle))
  document.text(page, pageLabel, PDF_PAGE_WIDTH - MARGIN - pageWidth, FOOTER_TOP, { size: 9, color: TEXT_MUTED })
}
