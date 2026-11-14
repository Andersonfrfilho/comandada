import { createHash } from 'crypto'

export const MENU_PDF = {
  contentType: 'application/pdf',
  fileName: 'cardapio.pdf',
  /** Cor da barra das categorias quando o restaurante não cadastrou a cor da marca. */
  defaultAccentColor: '#B3261E',
  /** Altura do logo convertido para o PDF, em pixels (o PDF desenha com 64 pt). */
  logoPixels: 256,
} as const

export const MENU_PDF_TEXT = {
  title: 'Cardápio',
  updatedOn: (date: string) => `atualizado em ${date}`,
  empty: 'O cardápio está sendo atualizado. Fale com a gente pelo WhatsApp.',
  howToOrder: (example: string) => `Para pedir, escreva no WhatsApp (ex.: ${example}) ou mande um áudio.`,
  fallbackExample: '2 itens do cardápio',
  page: (current: number, total: number) => `Página ${current} de ${total}`,
  whatsapp: (number: string) => `WhatsApp: ${number}`,
  instagram: (handle: string) => `Instagram: ${handle}`,
} as const

/** Versão curta do conteúdo do cardápio: muda quando um preço, item ou o logo muda, e com ela a URL. */
export function menuContentVersion(content: unknown): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 12)
}

/** URL pública do PDF (a Meta baixa por ela); `version` evita o WhatsApp reaproveitar um PDF antigo. */
export function menuPdfUrl(publicApiUrl: string, establishmentId: string, version: string): string {
  const baseUrl = publicApiUrl.replace(/\/$/, '')
  return `${baseUrl}/public/menu/${establishmentId}/${MENU_PDF.fileName}?v=${version}`
}
