import { describe, expect, it } from 'bun:test'
import sharp from 'sharp'
import { decodeImagePayload, prepareProductImage, productImagePath } from './productImage'

async function samplePng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 230, g: 90, b: 40, alpha: 1 } } })
    .png()
    .toBuffer()
}

describe('prepareProductImage', () => {
  it('reduz para no máximo 800 px no lado maior e grava em WebP', async () => {
    const prepared = await prepareProductImage(await samplePng(2000, 1000))
    const metadata = await sharp(prepared.content).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBe(800)
    expect(metadata.height).toBe(400)
    expect(prepared.version).toMatch(/^[0-9a-f]{12}$/)
  })

  it('não aumenta foto pequena', async () => {
    const prepared = await prepareProductImage(await samplePng(300, 200))
    const metadata = await sharp(prepared.content).metadata()
    expect(metadata.width).toBe(300)
  })

  it('recusa o que não é imagem', async () => {
    await expect(prepareProductImage(Buffer.from('não sou imagem'))).rejects.toThrow()
  })
})

describe('decodeImagePayload', () => {
  it('aceita data URL e base64 puro', () => {
    const base64 = Buffer.from('abc').toString('base64')
    expect(decodeImagePayload(`data:image/jpeg;base64,${base64}`).toString()).toBe('abc')
    expect(decodeImagePayload(base64).toString()).toBe('abc')
  })
})

describe('productImagePath', () => {
  it('monta o caminho com a versão e devolve null sem foto', () => {
    expect(productImagePath('p1', 'abc123')).toBe('/public/products/p1/foto.webp?v=abc123')
    expect(productImagePath('p1', null)).toBeNull()
  })
})
