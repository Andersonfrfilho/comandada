import { matchesSearch, sortRows } from '@/lib/listing'

// Filtro e ordenação da lista de produtos. O cardápio de um restaurante cabe inteiro na tela
// (centenas de itens, no máximo), então tudo roda no navegador, sem ida ao servidor.

export interface ListableProduct {
  readonly name: string
  readonly description: string | null
  readonly barcode: string | null
  readonly price: string
  readonly costPrice: string | null
  readonly sectionId: string | null
  readonly active: boolean
  readonly sortOrder: number
}

export const PRODUCT_SORT_OPTIONS = [
  { value: 'menu', label: 'Ordem do cardápio' },
  { value: 'name', label: 'Nome (A–Z)' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'margin_desc', label: 'Maior margem' },
  { value: 'margin_asc', label: 'Menor margem' },
] as const
export type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number]['value']

export const PRODUCT_STATUS_OPTIONS = [
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
] as const
export type ProductStatusFilter = (typeof PRODUCT_STATUS_OPTIONS)[number]['value']

export const NO_SECTION = '__none__'

export interface ProductListFilters {
  readonly search: string
  readonly status: ProductStatusFilter | ''
  readonly sectionId: string
  readonly sort: ProductSort
}

// Margem sobre o preço de venda; sem custo cadastrado não há margem.
export function productMarginPercent(product: Pick<ListableProduct, 'price' | 'costPrice'>): number | null {
  const price = Number(product.price)
  if (product.costPrice === null || !Number.isFinite(price) || price <= 0) return null
  const cost = Number(product.costPrice)
  if (!Number.isFinite(cost)) return null
  return ((price - cost) / price) * 100
}

export function filterAndSortProducts<TProduct extends ListableProduct>(
  products: readonly TProduct[],
  filters: ProductListFilters
): TProduct[] {
  const filtered = products.filter((product) => {
    if (filters.status === 'active' && !product.active) return false
    if (filters.status === 'inactive' && product.active) return false
    if (filters.sectionId === NO_SECTION && product.sectionId !== null) return false
    if (filters.sectionId && filters.sectionId !== NO_SECTION && product.sectionId !== filters.sectionId) return false
    return matchesSearch(filters.search, [product.name, product.description, product.barcode])
  })

  switch (filters.sort) {
    case 'name':
      return sortRows(filtered, (product) => product.name, 'asc')
    case 'price_desc':
      return sortRows(filtered, (product) => Number(product.price), 'desc')
    case 'price_asc':
      return sortRows(filtered, (product) => Number(product.price), 'asc')
    case 'margin_desc':
      return sortRows(filtered, productMarginPercent, 'desc')
    case 'margin_asc':
      return sortRows(filtered, productMarginPercent, 'asc')
    default:
      return sortRows(sortRows(filtered, (product) => product.name, 'asc'), (product) => product.sortOrder, 'asc')
  }
}
