import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { removeLogoBackground, removeLogoBackgroundFromDataUrl } from './removeLogoBackground'

// Logo de teste: fundo preto, círculo laranja e um "portal" quase preto encostado no fundo.
async function logoOnBlack(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" fill="#000"/>
    <circle cx="100" cy="100" r="60" fill="#ff6a00"/>
    <rect x="20" y="90" width="160" height="12" fill="#2a1a18"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return data[(y * info.width + x) * 4 + 3] ?? -1
}

describe('removeLogoBackground', () => {
  test('fundo liso some, desenho fica (inclusive o detalhe escuro encostado no fundo)', async () => {
    const png = await removeLogoBackground(await logoOnBlack())
    const metadata = await sharp(png).metadata()
    // Cortado no desenho: a barra vai de x=20 a 180, o círculo de y=40 a 160.
    expect(metadata.width).toBe(160)
    expect(metadata.height).toBe(120)
    expect(await alphaAt(png, 0, 0)).toBe(0)
    expect(await alphaAt(png, 80, 60)).toBe(255)
    expect(await alphaAt(png, 2, 55)).toBe(255)
  })

  test('foto sem fundo liso passa como está', async () => {
    const noise = Buffer.alloc(64 * 64 * 3)
    for (let index = 0; index < noise.length; index++) noise[index] = (index * 37) % 256
    const photo = await sharp(noise, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer()
    const png = await removeLogoBackground(photo)
    expect(await alphaAt(png, 0, 0)).toBe(255)
    expect((await sharp(png).metadata()).width).toBe(64)
  })

  test('data URL vira PNG sem fundo; texto que não é data URL volta igual', async () => {
    const dataUrl = `data:image/png;base64,${(await logoOnBlack()).toString('base64')}`
    const result = await removeLogoBackgroundFromDataUrl(dataUrl)
    expect(result.startsWith('data:image/png;base64,')).toBe(true)
    expect(await alphaAt(Buffer.from(result.split(',')[1] ?? '', 'base64'), 0, 0)).toBe(0)
    expect(await removeLogoBackgroundFromDataUrl('https://exemplo.com/logo.png')).toBe('https://exemplo.com/logo.png')
  })
})
