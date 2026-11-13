/**
 * Adaptador entre as rotas de catálogo do Order Hub e o contrato `ProductsApi` do
 * @adatechnology/products-ui.
 *
 * Sobra uma tradução só, depois do alinhamento de vocabulário: **dinheiro**. A API guarda
 * `numeric(10,2)` e devolve string decimal em reais; o SDK trabalha em centavo inteiro. A conversão
 * passa por `Math.round` sobre a string multiplicada, nunca por aritmética de float acumulada —
 * `0.1 + 0.2` não pode virar preço de venda.
 *
 * `uploadImage` não tem rota na API (sem storage de objetos) e lança erro em vez de falhar em
 * silêncio, porque um upload que "funciona" sem persistir é pior que a ausência do botão.
 */

import type {
  Catalog,
  CreateCatalogInput,
  CreateProductInput,
  PaginatedResponse,
  Product,
  ProductsApi,
  UpdateCatalogInput,
  UpdateProductInput,
} from '@adatechnology/products-ui'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { API_URL } from './apiEndpoints'

const CENTS_PER_UNIT = 100

interface OrderHubCatalog {
  id: string
  name: string
  active: boolean
  sortOrder: number
}

interface OrderHubProduct {
  id: string
  name: string
  description: string | null
  price: string
  costPrice: string | null
  imageUrl: string | null
  catalogId: string | null
  sectionId: string | null
  unit: string | null
  barcode: string | null
  preparationTimeMinutes: number | null
  preparationInstructions: string | null
  active: boolean
  sortOrder: number
}

function toCents(value: string | null): number {
  if (value === null) return 0
  return Math.round(Number(value) * CENTS_PER_UNIT)
}

function toDecimal(cents: number): number {
  return cents / CENTS_PER_UNIT
}

function toSdkProduct(product: OrderHubProduct): Product {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceInCents: toCents(product.price),
    imageUrl: product.imageUrl,
    catalogId: product.catalogId,
    active: product.active,
    sortOrder: product.sortOrder,
    availability: product.active ? 'available' : 'unavailable',
    costPriceInCents: product.costPrice === null ? null : toCents(product.costPrice),
    unit: product.unit,
    barcode: product.barcode,
    sectionId: product.sectionId,
    preparationTimeMinutes: product.preparationTimeMinutes,
    preparationInstructions: product.preparationInstructions,
  }
}

function toSdkCatalog(catalog: OrderHubCatalog): Catalog {
  return {
    id: catalog.id,
    name: catalog.name,
    description: null,
    active: catalog.active,
  }
}

// A rota devolve array puro: o catálogo de um estabelecimento cabe numa página, e paginar no
// servidor sem necessidade só adicionaria estado de sincronização para errar.
function asSinglePage<TItem>(items: readonly TItem[]): PaginatedResponse<TItem> {
  return { data: items, total: items.length, page: 1, pageSize: items.length, totalPages: 1 }
}

function toProductBody(input: CreateProductInput | UpdateProductInput): Record<string, unknown> {
  return {
    name: input.name,
    ...(input.description !== undefined && { description: input.description }),
    ...(input.priceInCents !== undefined && { price: toDecimal(input.priceInCents) }),
    ...(input.costPriceInCents !== undefined && {
      costPrice: toDecimal(input.costPriceInCents),
    }),
    ...(input.unit !== undefined && { unit: input.unit }),
    ...(input.barcode !== undefined && { barcode: input.barcode }),
    ...(input.catalogId !== undefined && { catalogId: input.catalogId }),
    ...(input.sectionId !== undefined && { sectionId: input.sectionId }),
    ...(input.preparationTimeMinutes !== undefined && {
      preparationTimeMinutes: input.preparationTimeMinutes,
    }),
    ...(input.preparationInstructions !== undefined && {
      preparationInstructions: input.preparationInstructions,
    }),
    ...('active' in input && input.active !== undefined && { active: input.active }),
    ...('sortOrder' in input && input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
  }
}

function token(): string | undefined {
  return useAuthStore.getState().accessToken ?? undefined
}

export const productsApiAdapter: ProductsApi = {
  async listProducts(params) {
    const products = await api.get<OrderHubProduct[]>('/catalog/products', token())
    const search = params?.search?.toLowerCase()
    const filtered = products
      .filter((product) => (params?.catalogId ? product.catalogId === params.catalogId : true))
      .filter((product) => (params?.active === undefined ? true : product.active === params.active))
      .filter((product) => (search ? product.name.toLowerCase().includes(search) : true))
    return asSinglePage(filtered.map(toSdkProduct))
  },

  async getProduct(id) {
    const products = await api.get<OrderHubProduct[]>('/catalog/products', token())
    const found = products.find((product) => product.id === id)
    if (!found) throw new Error('Produto não encontrado')
    return toSdkProduct(found)
  },

  async createProduct(data) {
    const created = await api.post<OrderHubProduct>(
      '/catalog/products',
      toProductBody(data),
      token()
    )
    return toSdkProduct(created)
  },

  async updateProduct(id, data) {
    const updated = await api.put<OrderHubProduct>(
      `/catalog/products/${id}`,
      toProductBody(data),
      token()
    )
    return toSdkProduct(updated)
  },

  async deleteProduct(id) {
    await api.delete(`/catalog/products/${id}`, token())
  },

  async listCatalogs(params) {
    const catalogs = await api.get<OrderHubCatalog[]>('/catalog/catalogs', token())
    const search = params?.search?.toLowerCase()
    const filtered = search
      ? catalogs.filter((catalog) => catalog.name.toLowerCase().includes(search))
      : catalogs
    return asSinglePage(filtered.map(toSdkCatalog))
  },

  async getCatalog(id) {
    const catalogs = await api.get<OrderHubCatalog[]>('/catalog/catalogs', token())
    const found = catalogs.find((catalog) => catalog.id === id)
    if (!found) throw new Error('Catálogo não encontrado')
    return toSdkCatalog(found)
  },

  async createCatalog(data: CreateCatalogInput) {
    const created = await api.post<OrderHubCatalog>(
      '/catalog/catalogs',
      { name: data.name },
      token()
    )
    return toSdkCatalog(created)
  },

  async updateCatalog(id, data: UpdateCatalogInput) {
    const updated = await api.put<OrderHubCatalog>(
      `/catalog/catalogs/${id}`,
      { name: data.name, ...(data.active !== undefined && { active: data.active }) },
      token()
    )
    return toSdkCatalog(updated)
  },

  async deleteCatalog(id) {
    await api.delete(`/catalog/catalogs/${id}`, token())
  },

  uploadImage() {
    return Promise.reject(new Error('Upload de imagem indisponível: a API não tem storage de objetos.'))
  },

  async bulkImportProducts(file) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${API_URL}/catalog/products/bulk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: formData,
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      throw new Error(body?.message ?? `Importação falhou com status ${response.status}`)
    }

    return response.json()
  },
}
