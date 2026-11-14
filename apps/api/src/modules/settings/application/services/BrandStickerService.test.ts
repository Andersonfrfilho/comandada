import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { BrandStickerService, toStickerWebp } from './BrandStickerService'
import { BRAND_STICKER, brandStickerUrl } from '../../shared/brandSticker.constant'

async function wideLogoPng(): Promise<Buffer> {
  return sharp({ create: { width: 900, height: 300, channels: 4, background: { r: 200, g: 30, b: 60, alpha: 1 } } })
    .png()
    .toBuffer()
}

describe('BrandStickerService', () => {
  test('gera WebP 512x512 com fundo transparente e abaixo de 100 KB', async () => {
    const webp = await toStickerWebp(await wideLogoPng())
    const metadata = await sharp(webp).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBe(BRAND_STICKER.size)
    expect(metadata.height).toBe(BRAND_STICKER.size)
    expect(metadata.hasAlpha).toBe(true)
    expect(webp.length).toBeLessThanOrEqual(BRAND_STICKER.maxBytes)
  })

  test('comprime até 100 KB mesmo com logo cheio de detalhe', async () => {
    const noise = Buffer.alloc(512 * 512 * 3)
    for (let index = 0; index < noise.length; index++) noise[index] = Math.floor(Math.random() * 256)
    const noisyPng = await sharp(noise, { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer()
    const webp = await toStickerWebp(noisyPng)
    expect(webp.length).toBeLessThanOrEqual(BRAND_STICKER.maxBytes)
  })

  test('lê o logo salvo como data URL, guarda em cache e refaz quando o logo muda', async () => {
    let logo: string | null = `data:image/png;base64,${(await wideLogoPng()).toString('base64')}`
    const service = new BrandStickerService({ forEstablishment: async () => ({ logo }) })
    const first = await service.forEstablishment('est-1')
    const second = await service.forEstablishment('est-1')
    expect(first).not.toBeNull()
    expect(second).toBe(first)
    logo = `data:image/png;base64,${(await sharp({ create: { width: 100, height: 100, channels: 4, background: '#00ff00' } }).png().toBuffer()).toString('base64')}`
    const third = await service.forEstablishment('est-1')
    expect(third?.version).not.toBe(first?.version)
    logo = null
    expect(await service.forEstablishment('est-1')).toBeNull()
  })

  test('URL da figurinha muda com o logo e some sem logo', () => {
    const first = brandStickerUrl('https://api.exemplo.com/', 'abc', 'data:image/png;base64,AAA')
    const second = brandStickerUrl('https://api.exemplo.com', 'abc', 'data:image/png;base64,BBB')
    expect(first).toStartWith('https://api.exemplo.com/public/branding/abc/sticker.webp?v=')
    expect(first).not.toBe(second)
    expect(brandStickerUrl('https://api.exemplo.com', 'abc', '')).toBeNull()
    expect(brandStickerUrl('https://api.exemplo.com', 'abc', null)).toBeNull()
  })
})
