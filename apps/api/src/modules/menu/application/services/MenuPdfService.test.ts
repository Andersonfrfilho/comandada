import { describe, expect, test } from 'bun:test'
import { inflateSync } from 'zlib'
import sharp from 'sharp'
import { MenuPdfService, formatPhone, groupMenuCategories, parseHexColor, type MenuSource, type MenuSourceProduct } from './MenuPdfService'
import { menuContentVersion, menuPdfUrl } from '../../shared/menuPdf.constant'
import { printableText, toWinAnsiBytes } from '../../infra/pdf/SimplePdfDocument'

function product(overrides: Partial<MenuSourceProduct>): MenuSourceProduct {
  return { name: 'Item', price: 10, description: null, category: 'Combos', variantGroup: null, variantLabel: null, ...overrides }
}

function source(products: MenuSourceProduct[], logo: string | null = null): MenuSource {
  return {
    name: 'Yuyaki Sushi',
    whatsappNumber: '5516999990000',
    logo,
    primaryColor: '#e85d04',
    address: 'Rua das Flores, 123',
    city: 'Ribeirão Preto/SP',
    instagram: '@yuyaki',
    products,
  }
}

/** Texto de todas as páginas, com os fluxos descomprimidos (só para conferir o conteúdo no teste). */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1')
  const streams: string[] = []
  const pattern = /\/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw))) {
    const start = match.index + match[0].length
    const length = Number(match[1])
    streams.push(inflateSync(pdf.subarray(start, start + length)).toString('latin1'))
  }
  return streams.join('\n')
}

describe('groupMenuCategories', () => {
  test('mantém a ordem do cadastro e junta os tamanhos do mesmo item numa linha', () => {
    const categories = groupMenuCategories([
      product({ name: 'Combo Tradicional', price: 59.9, category: 'Combos' }),
      product({ name: 'Temaki Hot (Médio)', price: 37, category: 'Temakis', variantGroup: 'temaki-hot', variantLabel: 'Médio' }),
      product({ name: 'Temaki Hot (Grande)', price: 49, category: 'Temakis', variantGroup: 'temaki-hot', variantLabel: 'Grande', description: 'Empanado' }),
      product({ name: 'Combo Especial', price: 79.9, category: 'Combos' }),
    ])
    expect(categories.map((category) => category.name)).toEqual(['Combos', 'Temakis'])
    expect(categories[0]?.items.map((item) => item.name)).toEqual(['Combo Tradicional', 'Combo Especial'])
    expect(categories[1]?.items).toEqual([
      { name: 'Temaki Hot', priceText: 'Médio R$ 37,00 · Grande R$ 49,00', description: 'Empanado' },
    ])
  })
})

describe('MenuPdfService', () => {
  test('gera um PDF com nome, categorias, itens, preços e a dica de como pedir', async () => {
    const service = new MenuPdfService(
      { forEstablishment: async () => source([product({ name: 'Hot Roll Salmão 🍣', price: 39.9, category: 'Hot Roll', description: 'Salmão e cream cheese' })]) },
      async () => Buffer.alloc(0),
      () => '14/11/2026'
    )
    const menu = await service.forEstablishment('id')
    expect(menu).not.toBeNull()
    const pdf = menu?.pdf ?? Buffer.alloc(0)
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
    expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true)
    const text = pdfText(pdf)
    expect(text).toContain('Yuyaki Sushi')
    expect(text).toContain('HOT ROLL')
    // Emoji não existe na Helvetica: sai do texto em vez de virar caractere quebrado.
    expect(text).toContain('(Hot Roll Salm\xe3o) Tj')
    expect(text).toContain('R$ 39,90')
    expect(text).toContain('atualizado em 14/11/2026')
    expect(text).toContain('Para pedir, escreva no WhatsApp \\(ex.: 2 hot roll salm\xe3o\\)')
  })

  test('embute o logo como JPEG e reaproveita o PDF enquanto nada muda', async () => {
    const logo = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#003366' } }).png().toBuffer()
    let reads = 0
    const service = new MenuPdfService(
      {
        forEstablishment: async () => {
          reads += 1
          return source([product({ name: 'Combo' })], `data:image/png;base64,${logo.toString('base64')}`)
        },
      },
      async () => Buffer.alloc(0),
      () => '14/11/2026'
    )
    const first = await service.forEstablishment('id')
    const second = await service.forEstablishment('id')
    expect(reads).toBe(2)
    expect(second).toBe(first)
    expect(first?.pdf.toString('latin1')).toContain('/Filter /DCTDecode')
  })

  test('cardápio grande quebra em várias páginas, cada uma com o número', async () => {
    const products = Array.from({ length: 80 }, (_, index) =>
      product({ name: `Item ${index + 1}`, category: `Categoria ${Math.floor(index / 10)}`, description: 'Descrição longa '.repeat(8) })
    )
    const service = new MenuPdfService({ forEstablishment: async () => source(products) }, async () => Buffer.alloc(0), () => '14/11/2026')
    const pdf = (await service.forEstablishment('id'))?.pdf ?? Buffer.alloc(0)
    const pages = Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1])
    expect(pages).toBeGreaterThan(2)
    expect(pdfText(pdf)).toContain(`P\xe1gina ${pages} de ${pages}`)
  })

  test('restaurante que não existe não tem cardápio', async () => {
    const service = new MenuPdfService({ forEstablishment: async () => null })
    expect(await service.forEstablishment('id')).toBeNull()
  })
})

describe('auxiliares do cardápio', () => {
  test('texto fora da WinAnsi some e parênteses saem escapados no PDF', () => {
    expect(printableText('Combo 🍱 Família')).toBe('Combo Família')
    expect(toWinAnsiBytes('“ok” — 5€')).toEqual([0x93, 0x6f, 0x6b, 0x94, 0x20, 0x97, 0x20, 0x35, 0x80])
  })

  test('telefone, cor e URL versionada', () => {
    expect(formatPhone('5516999990000')).toBe('(16) 99999-0000')
    expect(parseHexColor('#E85D04')).toEqual([232, 93, 4])
    expect(parseHexColor('laranja')).toBeNull()
    const version = menuContentVersion({ products: [1] })
    expect(version).not.toBe(menuContentVersion({ products: [2] }))
    expect(menuPdfUrl('https://api.exemplo.com/', 'abc', version)).toBe(`https://api.exemplo.com/public/menu/abc/cardapio.pdf?v=${version}`)
  })
})
