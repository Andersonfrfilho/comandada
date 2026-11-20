import type { ReactNode } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import {
  ProductsProvider,
  PRODUCT_OPTIONAL_FIELD,
  type CreateProductInput,
  type MoneyFormat,
} from '@adatechnology/products-ui'
import { productsApiAdapter } from '@/lib/productsApiAdapter'

export const MONEY_FORMAT: MoneyFormat = { currency: 'BRL', locale: 'pt-BR' }

// Só os campos que existem no schema do Order Hub. `INVENTORY` e `SYNC_STATUS` ficam de fora:
// estoque vive em `stock_batches` por ingrediente, não por produto, e não há sincronização externa.
const PRODUCTS_FIELDS = [
  PRODUCT_OPTIONAL_FIELD.COST_PRICE,
  PRODUCT_OPTIONAL_FIELD.UNIT,
  PRODUCT_OPTIONAL_FIELD.BARCODE,
  PRODUCT_OPTIONAL_FIELD.SECTION,
  PRODUCT_OPTIONAL_FIELD.PREPARATION_TIME,
  PRODUCT_OPTIONAL_FIELD.PREPARATION_INSTRUCTIONS,
  PRODUCT_OPTIONAL_FIELD.SORT_ORDER,
] as const

// A API valida a unidade com `z.enum` — qualquer opção extra do SDK viraria 400 no salvamento.
const UNIT_OPTIONS = ['un', 'kg', 'g', 'l', 'ml'] as const

// Margem sobre o preço de venda, que é a definição do SDK e a usada no varejo. Por isso o teto é
// abaixo de 100%: uma margem de 100% sobre a venda implicaria custo zero.
const MARGIN_SHORTCUT_PERCENTS = [30, 50, 60] as const

export const UNIT_LABELS: Record<string, string> = {
  un: 'Unidade',
  kg: 'Quilo',
  g: 'Grama',
  l: 'Litro',
  ml: 'Mililitro',
}

export interface Catalog {
  id: string
  name: string
  slug: string
  active: boolean
  sortOrder: number
  ncmCode?: string
  cfopCode?: string
  cstIcms?: string
}

export interface Section {
  id: string
  name: string
  description: string | null
}

export interface Product {
  id: string
  name: string
  description: string | null
  price: string
  costPrice: string | null
  unit: string
  barcode: string | null
  catalogId: string | null
  sectionId: string | null
  preparationTimeMinutes: number | null
  preparationInstructions: string | null
  active: boolean
  sortOrder: number
  imageVersion: string | null
}

// ── Endereços das telas ──────────────────────────────────────────────────
// Categoria e produto viram páginas com URL própria: dá para voltar, recarregar e mandar o link.

export const CATALOG_PATH = '/catalog'
/** Produtos sem catálogo não têm id; a página deles usa este pedaço no lugar. */
export const WITHOUT_CATALOG_SLUG = 'sem-catalogo'

export function catalogCategoryPath(catalogId: string | null): string {
  return `${CATALOG_PATH}/categoria/${catalogId ?? WITHOUT_CATALOG_SLUG}`
}

export function catalogProductPath(productId: string): string {
  return `${CATALOG_PATH}/produto/${productId}`
}

// ── Dados ────────────────────────────────────────────────────────────────

/** Mesmas chaves do React Query em toda tela do catálogo: lista, categoria e produto dividem o cache. */
export function useCatalogData() {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined

  const catalogsQuery = useQuery({
    queryKey: ['catalog-catalogs'],
    queryFn: () => api.get<Catalog[]>('/catalog/catalogs', accessToken),
  })
  const productsQuery = useQuery({
    queryKey: ['catalog-products'],
    queryFn: () => api.get<Product[]>('/catalog/products', accessToken),
  })
  const sectionsQuery = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get<Section[]>('/sections', accessToken),
  })

  return {
    catalogs: catalogsQuery.data ?? [],
    products: productsQuery.data ?? [],
    sections: sectionsQuery.data ?? [],
    isLoadingProducts: productsQuery.isLoading,
  }
}

export function invalidateCatalogQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['catalog-catalogs'] })
  void queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
  void queryClient.invalidateQueries({ queryKey: ['menu'] })
  void queryClient.invalidateQueries({ queryKey: ['sections'] })
}

// ── Formulário do SDK ────────────────────────────────────────────────────

export function CatalogProductsProvider({ children }: { children: ReactNode }) {
  return (
    <ProductsProvider
      api={productsApiAdapter}
      config={{
        currency: MONEY_FORMAT.currency,
        locale: MONEY_FORMAT.locale,
        fields: PRODUCTS_FIELDS,
        unitOptions: UNIT_OPTIONS,
        marginShortcutPercents: MARGIN_SHORTCUT_PERCENTS,
      }}
    >
      {children}
    </ProductsProvider>
  )
}

// A API guarda o preço como decimal em reais e o SDK formata centavo inteiro. A multiplicação
// arredondada mora só aqui — ver `productsApiAdapter` para o mesmo contrato do lado das mutações.
export function toCents(value: string | number): number {
  return Math.round(Number(value) * 100)
}

/** Valores do produto salvo no formato do `ProductForm` (centavos). */
export function productFormValues(product: Product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceInCents: toCents(product.price),
    costPriceInCents: product.costPrice === null ? null : toCents(product.costPrice),
    unit: product.unit,
    barcode: product.barcode,
    catalogId: product.catalogId,
    sectionId: product.sectionId,
    preparationTimeMinutes: product.preparationTimeMinutes,
    preparationInstructions: product.preparationInstructions,
    sortOrder: product.sortOrder,
    active: product.active,
  }
}

export type ProductFormSubmit = CreateProductInput & { active?: boolean; sortOrder?: number }

/** O SDK entrega centavos; a API espera reais. */
export function productRequestBody(data: ProductFormSubmit) {
  return {
    name: data.name,
    description: data.description ?? undefined,
    price: data.priceInCents / 100,
    costPrice: data.costPriceInCents ? data.costPriceInCents / 100 : null,
    unit: data.unit ?? 'un',
    barcode: data.barcode ?? null,
    catalogId: data.catalogId ?? null,
    sectionId: data.sectionId ?? null,
    preparationTimeMinutes: data.preparationTimeMinutes ?? null,
    preparationInstructions: data.preparationInstructions ?? null,
    sortOrder: data.sortOrder ?? 0,
    active: data.active ?? true,
  }
}
