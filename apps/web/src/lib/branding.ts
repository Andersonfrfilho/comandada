import { DEFAULT_BRANDING } from '@/constants/branding'

export interface Branding {
  name: string
  logo: string | null
  primaryColor: string
}

export interface BrandingResponse {
  name?: string | null
  logo?: string | null
  primaryColor?: string | null
}

const HEX_COLOR = /^#([0-9a-f]{6})$/i

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim())
}

export function toBranding(response: BrandingResponse | null | undefined): Branding {
  const primaryColor = response?.primaryColor && isHexColor(response.primaryColor)
    ? response.primaryColor
    : DEFAULT_BRANDING.primaryColor
  const name = response?.name?.trim() || DEFAULT_BRANDING.name
  // O logo do ComandAdA só aparece na marca padrão; restaurante sem logo mostra as iniciais.
  const fallbackLogo = name === DEFAULT_BRANDING.name ? DEFAULT_BRANDING.logo : null
  return {
    name,
    logo: response?.logo || fallbackLogo,
    primaryColor,
  }
}

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return color.map((channel, index) => Math.round(channel + (target[index] - channel) * amount)) as Rgb
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

// A cor principal vira a escala brand-50…700 do Tailwind: 600 é a cor exata (botões), os tons
// claros misturam branco e o 700 (hover) escurece.
export function paletteFrom(primaryColor: string): Record<string, Rgb> {
  const base = hexToRgb(primaryColor)
  return {
    50: mix(base, WHITE, 0.93),
    100: mix(base, WHITE, 0.85),
    200: mix(base, WHITE, 0.7),
    300: mix(base, WHITE, 0.5),
    400: mix(base, WHITE, 0.3),
    500: mix(base, WHITE, 0.12),
    600: base,
    700: mix(base, BLACK, 0.2),
  }
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? 'C').slice(0, 2)
  return letters.toUpperCase()
}

export function initialsBadgeSvg(name: string, primaryColor: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='${primaryColor}'/><text x='32' y='42' font-family='system-ui,sans-serif' font-size='26' font-weight='700' fill='white' text-anchor='middle'>${initialsOf(name)}</text></svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

function setLink(rel: string, href: string): void {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    document.head.appendChild(link)
  }
  link.removeAttribute('type')
  link.href = href
}

// Aplica a marca na página: variáveis de cor, título da aba, favicon e cor da barra no celular.
export function applyBranding(branding: Branding): void {
  const root = document.documentElement
  for (const [shade, rgb] of Object.entries(paletteFrom(branding.primaryColor))) {
    root.style.setProperty(`--brand-${shade}`, rgb.join(' '))
  }
  document.title = branding.name
  const icon = branding.logo ?? initialsBadgeSvg(branding.name, branding.primaryColor)
  setLink('icon', icon)
  setLink('apple-touch-icon', icon)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', branding.primaryColor)
}

export function initialsOfBrand(name: string): string {
  return initialsOf(name)
}

// Reduz a imagem para caber em maxSize × maxSize e devolve um data URL (PNG, mantém transparência).
export function resizeImageToDataUrl(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não consegui ler a imagem'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('Arquivo de imagem inválido'))
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const context = canvas.getContext('2d')
        if (!context) return reject(new Error('Navegador sem suporte a imagem'))
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function toHex(color: Rgb): string {
  return '#' + color.map((channel) => channel.toString(16).padStart(2, '0')).join('')
}

function relativeLuminance(color: Rgb): number {
  const [red, green, blue] = color.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

// Texto branco em cima da cor (botões) precisa de contraste de pelo menos 3:1.
const MINIMUM_CONTRAST_WITH_WHITE = 3

function readableOnWhiteText(color: Rgb): Rgb {
  let adjusted = color
  for (let step = 0; step < 20; step += 1) {
    if (1.05 / (relativeLuminance(adjusted) + 0.05) >= MINIMUM_CONTRAST_WITH_WHITE) break
    adjusted = mix(adjusted, BLACK, 0.08)
  }
  return adjusted
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não consegui ler a imagem'))
    image.src = source
  })
}

// Cor mais marcante do logo: agrupa os pixels por tom, ignora fundo transparente, branco, preto e
// cinza, e dá mais peso às cores mais vivas. Escurece se o texto branco dos botões ficar ilegível.
// Sem cor viva no logo (logo preto e branco, por exemplo), devolve null.
export async function extractBrandColor(source: string): Promise<string | null> {
  const image = await loadImage(source)
  const sampleSize = 64
  const canvas = document.createElement('canvas')
  canvas.width = sampleSize
  canvas.height = sampleSize
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, sampleSize, sampleSize)
  const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data

  const buckets = new Map<number, { weight: number; sum: Rgb; count: number }>()
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3]
    if (alpha < 128) continue
    const color: Rgb = [pixels[index], pixels[index + 1], pixels[index + 2]]
    const maximum = Math.max(...color)
    const minimum = Math.min(...color)
    const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum
    if (maximum < 40 || saturation < 0.25) continue
    const key = ((color[0] >> 4) << 8) | ((color[1] >> 4) << 4) | (color[2] >> 4)
    const bucket = buckets.get(key) ?? { weight: 0, sum: [0, 0, 0], count: 0 }
    bucket.weight += saturation * (maximum / 255)
    bucket.sum = bucket.sum.map((total, channel) => total + color[channel]) as Rgb
    bucket.count += 1
    buckets.set(key, bucket)
  }

  let best: { weight: number; sum: Rgb; count: number } | null = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) best = bucket
  }
  if (!best || best.count < 8) return null
  const average = best.sum.map((total) => Math.round(total / best.count)) as Rgb
  return toHex(readableOnWhiteText(average))
}
