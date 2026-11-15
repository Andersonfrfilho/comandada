import { describe, expect, it } from 'bun:test'

import { NO_SECTION, filterAndSortProducts, productMarginPercent, type ListableProduct } from './productListing'

function product(overrides: Partial<ListableProduct> & { name: string }): ListableProduct {
  return {
    description: null,
    barcode: null,
    price: '10.00',
    costPrice: null,
    sectionId: null,
    active: true,
    sortOrder: 0,
    ...overrides,
  }
}

const products = [
  product({ name: 'Temaki salmão', price: '32.00', costPrice: '12.00', sectionId: 'quentes', sortOrder: 2 }),
  product({ name: 'Hot roll', price: '28.00', costPrice: '20.00', sectionId: 'quentes', sortOrder: 1 }),
  product({ name: 'Água', price: '5.00', active: false, sortOrder: 3, barcode: '7891234567890' }),
  product({ name: 'Combo tradicional', price: '89.90', description: '32 unidades', sortOrder: 1 }),
]

const noFilters = { search: '', status: '', sectionId: '', sort: 'menu' } as const

describe('productMarginPercent', () => {
  it('calcula a margem sobre o preço e devolve null sem custo', () => {
    expect(productMarginPercent({ price: '32.00', costPrice: '12.00' })).toBeCloseTo(62.5)
    expect(productMarginPercent({ price: '10.00', costPrice: null })).toBeNull()
    expect(productMarginPercent({ price: '0', costPrice: '1' })).toBeNull()
  })
})

describe('filterAndSortProducts', () => {
  it('ordem do cardápio: sortOrder e depois nome', () => {
    expect(filterAndSortProducts(products, noFilters).map((item) => item.name)).toEqual([
      'Combo tradicional',
      'Hot roll',
      'Temaki salmão',
      'Água',
    ])
  })

  it('busca sem acento em nome, descrição e código de barras', () => {
    expect(filterAndSortProducts(products, { ...noFilters, search: 'salmao' }).map((item) => item.name)).toEqual([
      'Temaki salmão',
    ])
    expect(filterAndSortProducts(products, { ...noFilters, search: '32 unidades' })).toHaveLength(1)
    expect(filterAndSortProducts(products, { ...noFilters, search: '789123' })[0]?.name).toBe('Água')
  })

  it('filtra por status e seção', () => {
    expect(filterAndSortProducts(products, { ...noFilters, status: 'inactive' }).map((item) => item.name)).toEqual(['Água'])
    expect(filterAndSortProducts(products, { ...noFilters, sectionId: 'quentes' })).toHaveLength(2)
    expect(filterAndSortProducts(products, { ...noFilters, sectionId: NO_SECTION })).toHaveLength(2)
  })

  it('ordena por preço e margem, com produtos sem custo no fim', () => {
    expect(filterAndSortProducts(products, { ...noFilters, sort: 'price_desc' })[0]?.name).toBe('Combo tradicional')
    expect(filterAndSortProducts(products, { ...noFilters, sort: 'margin_desc' }).map((item) => item.name).slice(0, 2)).toEqual([
      'Temaki salmão',
      'Hot roll',
    ])
    expect(filterAndSortProducts(products, { ...noFilters, sort: 'margin_asc' })[0]?.name).toBe('Hot roll')
  })
})
