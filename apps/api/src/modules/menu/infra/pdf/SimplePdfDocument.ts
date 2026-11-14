import { deflateSync } from 'zlib'
import { HELVETICA_BOLD_WIDTHS, HELVETICA_WIDTHS, WIN_ANSI_EXTRA } from './helveticaMetrics'

/**
 * Escritor de PDF mínimo, só com o que o cardápio precisa: texto em Helvetica (as fontes que todo
 * leitor de PDF já tem, então nada é embutido), retângulos, linhas e uma imagem JPEG (o logo).
 *
 * Feito à mão para não trazer dependência nova à imagem da API: a Helvetica cobre o português
 * inteiro (codificação WinAnsi), e emoji, que nenhuma fonte-padrão desenha, é descartado.
 * As coordenadas da API desta classe têm a origem no canto de cima, como numa tela; a conversão
 * para o sistema do PDF (origem embaixo) fica toda aqui.
 */

export type PdfFont = 'regular' | 'bold'
export type RgbColor = readonly [number, number, number]

export interface PdfTextOptions {
  font?: PdfFont
  size: number
  color?: RgbColor
}

export interface PdfJpegImage {
  data: Buffer
  width: number
  height: number
}

/** A4 em pontos. */
export const PDF_PAGE_WIDTH = 595.28
export const PDF_PAGE_HEIGHT = 841.89

const FONT_RESOURCE: Record<PdfFont, string> = { regular: 'F1', bold: 'F2' }
const FONT_WIDTHS: Record<PdfFont, readonly number[]> = { regular: HELVETICA_WIDTHS, bold: HELVETICA_BOLD_WIDTHS }
const BLACK: RgbColor = [0, 0, 0]

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function colorOperands(color: RgbColor): string {
  return color.map((channel) => formatNumber(channel / 255)).join(' ')
}

/** Byte WinAnsi de cada caractere; o que a codificação não tem (emoji, ideograma) some. */
export function toWinAnsiBytes(text: string): number[] {
  const bytes: number[] = []
  for (const character of text.normalize('NFC')) {
    const code = character.codePointAt(0) ?? 0
    if (code >= 0x20 && code <= 0x7e) bytes.push(code)
    else if (code >= 0xa0 && code <= 0xff) bytes.push(code)
    else if (WIN_ANSI_EXTRA[character] !== undefined) bytes.push(WIN_ANSI_EXTRA[character])
    else if (code === 0x09) bytes.push(0x20)
  }
  return bytes
}

/** Tira o que a fonte não desenha e os espaços que sobram no lugar do emoji. */
export function printableText(text: string): string {
  return String.fromCharCode(...toWinAnsiBytes(text)).replace(/\s+/g, ' ').trim()
}

function escapeLiteral(bytes: number[]): string {
  let literal = ''
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) literal += '\\' + String.fromCharCode(byte)
    else literal += String.fromCharCode(byte)
  }
  return literal
}

export class SimplePdfDocument {
  private readonly pages: string[][] = []
  private readonly images: PdfJpegImage[] = []

  get pageCount(): number {
    return this.pages.length
  }

  addPage(): number {
    this.pages.push([])
    return this.pages.length - 1
  }

  textWidth(text: string, options: PdfTextOptions): number {
    const widths = FONT_WIDTHS[options.font ?? 'regular']
    const total = toWinAnsiBytes(text).reduce((sum, byte) => sum + (widths[byte] ?? 0), 0)
    return (total / 1000) * options.size
  }

  /** `top` é a linha de base medida do topo da página. */
  text(pageIndex: number, text: string, left: number, top: number, options: PdfTextOptions): void {
    const bytes = toWinAnsiBytes(text)
    if (bytes.length === 0) return
    const color = options.color ?? BLACK
    this.page(pageIndex).push(
      `BT /${FONT_RESOURCE[options.font ?? 'regular']} ${formatNumber(options.size)} Tf ${colorOperands(color)} rg ` +
        `${formatNumber(left)} ${formatNumber(PDF_PAGE_HEIGHT - top)} Td (${escapeLiteral(bytes)}) Tj ET`
    )
  }

  rect(pageIndex: number, left: number, top: number, width: number, height: number, color: RgbColor): void {
    this.page(pageIndex).push(
      `${colorOperands(color)} rg ${formatNumber(left)} ${formatNumber(PDF_PAGE_HEIGHT - top - height)} ` +
        `${formatNumber(width)} ${formatNumber(height)} re f`
    )
  }

  line(
    pageIndex: number,
    from: { left: number; top: number },
    to: { left: number; top: number },
    color: RgbColor,
    lineWidth: number,
    dash?: readonly [number, number]
  ): void {
    const dashPattern = dash ? `[${dash.map(formatNumber).join(' ')}] 0 d` : '[] 0 d'
    this.page(pageIndex).push(
      `${colorOperands(color)} RG ${formatNumber(lineWidth)} w ${dashPattern} ` +
        `${formatNumber(from.left)} ${formatNumber(PDF_PAGE_HEIGHT - from.top)} m ` +
        `${formatNumber(to.left)} ${formatNumber(PDF_PAGE_HEIGHT - to.top)} l S`
    )
  }

  image(pageIndex: number, image: PdfJpegImage, left: number, top: number, width: number, height: number): void {
    this.images.push(image)
    const name = `Im${this.images.length}`
    this.page(pageIndex).push(
      `q ${formatNumber(width)} 0 0 ${formatNumber(height)} ${formatNumber(left)} ${formatNumber(PDF_PAGE_HEIGHT - top - height)} cm /${name} Do Q`
    )
  }

  /** Quebra o texto em linhas que cabem na largura (palavra longa demais é cortada). */
  wrap(text: string, maxWidth: number, options: PdfTextOptions): string[] {
    const words = printableText(text).split(' ').filter(Boolean)
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word
      if (this.textWidth(candidate, options) <= maxWidth) {
        current = candidate
        continue
      }
      if (current) lines.push(current)
      current = word
      while (this.textWidth(current, options) > maxWidth && current.length > 1) {
        let cut = current.length - 1
        while (cut > 1 && this.textWidth(current.slice(0, cut), options) > maxWidth) cut -= 1
        lines.push(current.slice(0, cut))
        current = current.slice(cut)
      }
    }
    if (current) lines.push(current)
    return lines
  }

  toBuffer(info: { title: string }): Buffer {
    const objects: Buffer[] = []
    const reserve = (): number => objects.push(Buffer.alloc(0))
    const set = (id: number, body: Buffer | string): void => {
      objects[id - 1] = typeof body === 'string' ? Buffer.from(body, 'latin1') : body
    }
    const stream = (dictionary: string, data: Buffer): Buffer =>
      Buffer.concat([
        Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`, 'latin1'),
        data,
        Buffer.from('\nendstream', 'latin1'),
      ])

    const catalogId = reserve()
    const pagesId = reserve()
    const regularFontId = reserve()
    const boldFontId = reserve()
    const infoId = reserve()
    set(regularFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    set(boldFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    set(infoId, `<< /Title (${escapeLiteral(toWinAnsiBytes(info.title))}) /Producer (ComandAdA) >>`)

    const imageIds = this.images.map((image) => {
      const id = reserve()
      set(
        id,
        stream(
          `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
          image.data
        )
      )
      return id
    })
    const xObjects = imageIds.map((id, index) => `/Im${index + 1} ${id} 0 R`).join(' ')
    const resources =
      `<< /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >>` + (xObjects ? ` /XObject << ${xObjects} >>` : '') + ' >>'

    const pageIds = this.pages.map((operations) => {
      const contentId = reserve()
      set(contentId, stream('/Filter /FlateDecode', deflateSync(Buffer.from(operations.join('\n'), 'latin1'))))
      const pageId = reserve()
      set(
        pageId,
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] ` +
          `/Resources ${resources} /Contents ${contentId} 0 R >>`
      )
      return pageId
    })
    set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
    set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

    const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
    let offset = chunks[0]?.length ?? 0
    const offsets: number[] = []
    objects.forEach((body, index) => {
      offsets.push(offset)
      const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')])
      chunks.push(chunk)
      offset += chunk.length
    })
    const xref = [
      'xref',
      `0 ${objects.length + 1}`,
      '0000000000 65535 f ',
      ...offsets.map((position) => `${String(position).padStart(10, '0')} 00000 n `),
      'trailer',
      `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>`,
      'startxref',
      String(offset),
      '%%EOF',
    ].join('\n')
    chunks.push(Buffer.from(xref + '\n', 'latin1'))
    return Buffer.concat(chunks)
  }

  private page(pageIndex: number): string[] {
    const operations = this.pages[pageIndex]
    if (!operations) throw new Error(`Página ${pageIndex} não existe`)
    return operations
  }
}
