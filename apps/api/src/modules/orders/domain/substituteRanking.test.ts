import { describe, expect, it } from 'bun:test'

import { rankSubstitutes, type SubstituteCandidate } from './substituteRanking'

const ceviches = 'cat-ceviche'
const fritos = 'cat-fritos'

function product(id: string, name: string, price: number, catalogId: string | null, variantGroup: string | null = null): SubstituteCandidate {
  return { productId: id, productName: name, unitPrice: price, catalogId, catalogName: catalogId, variantGroup }
}

const catalog: SubstituteCandidate[] = [
  product('p-mix', 'Ceviche Mix', 60, ceviches),
  product('p-salmao', 'Ceviche de Salmão', 58, ceviches),
  product('p-peixe', 'Ceviche de Peixe Branco', 45, ceviches),
  product('p-polvo', 'Ceviche de Polvo', 120, ceviches),
  product('p-camarao', 'Camarão Empanado', 75, fritos),
  product('p-temaki-m', 'Temaki Salmão Médio', 25, 'cat-temaki', 'temaki-salmao'),
  product('p-temaki-g', 'Temaki Salmão Grande', 32, 'cat-temaki', 'temaki-salmao'),
  product('p-temaki-atum', 'Temaki Atum', 31, 'cat-temaki'),
]

const ceviche = { productId: 'p-mix', productName: 'Ceviche Mix', unitPrice: 60, catalogId: ceviches, variantGroup: null }

describe('rankSubstitutes', () => {
  it('sugere da mesma categoria, pelo preço mais parecido', () => {
    const ids = rankSubstitutes(ceviche, catalog).map((candidate) => candidate.productId)
    expect(ids).toEqual(['p-salmao', 'p-peixe'])
  })

  it('não sugere o próprio item nem outra categoria', () => {
    const ids = rankSubstitutes(ceviche, catalog).map((candidate) => candidate.productId)
    expect(ids).not.toContain('p-mix')
    expect(ids).not.toContain('p-camarao')
  })

  it('deixa de fora o que é bem mais caro', () => {
    const ids = rankSubstitutes(ceviche, catalog).map((candidate) => candidate.productId)
    expect(ids).not.toContain('p-polvo')
  })

  it('outro tamanho do mesmo item vem primeiro', () => {
    const target = { productId: 'p-temaki-g', productName: 'Temaki Salmão Grande', unitPrice: 32, catalogId: 'cat-temaki', variantGroup: 'temaki-salmao' }
    const ids = rankSubstitutes(target, catalog).map((candidate) => candidate.productId)
    expect(ids).toEqual(['p-temaki-m', 'p-temaki-atum'])
  })

  it('pula produtos que também estão em falta', () => {
    const ids = rankSubstitutes(ceviche, catalog, new Set(['p-salmao'])).map((candidate) => candidate.productId)
    expect(ids).toEqual(['p-peixe'])
  })

  it('item sem produto do cadastro acha pela categoria e ignora o mesmo nome', () => {
    const target = { productId: null, productName: 'ceviche mix', unitPrice: 60, catalogId: ceviches, variantGroup: null }
    const ids = rankSubstitutes(target, catalog).map((candidate) => candidate.productId)
    expect(ids).toEqual(['p-salmao', 'p-peixe'])
  })

  it('respeita o limite', () => {
    expect(rankSubstitutes(ceviche, catalog, new Set(), 1)).toHaveLength(1)
  })
})
