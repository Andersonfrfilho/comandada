import { useState, useRef, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Boxes, ChevronRight, Pencil, Plus, Trash2, Wand2 } from 'lucide-react'
import {
  FISCAL_DEFAULTS,
  FISCAL_FIELD_HINTS,
  FISCAL_SECTION_TITLE,
  FISCAL_SECTION_HELP,
  FISCAL_APPLY_DEFAULTS_LABEL,
} from '@/constants/fiscalDefaults'
import { SectionManager } from './components/SectionManager'
import { ProductRecipeEditor } from './components/ProductRecipeEditor'
import { RecipeCostBadge } from './components/RecipeCostBadge'
import { useRecipeCosts } from '@/hooks/useRecipeCosts'
import { StockAlertBadges } from '@/components/stock/StockAlertBadges'
import { BarcodeScanner } from './components/BarcodeScanner'
import { ProductPhotoManager } from './components/ProductPhotoManager'
import { productImagePath, productImageUrl } from '@/lib/productImage'
import {
  ProductForm,
  formatBarcode,
  formatMarginPercent,
  formatMoney,
  type ProductSuggestion,
} from '@adatechnology/products-ui'
import { FilterSelect, SearchField, FilterField } from '@/components/ui/ListFilters'
import {
  NO_SECTION,
  PRODUCT_SORT_OPTIONS,
  PRODUCT_STATUS_OPTIONS,
  filterAndSortProducts,
  type ProductSort,
  type ProductStatusFilter,
} from './productListing'
import {
  CATALOG_PATH,
  CatalogProductsProvider,
  MONEY_FORMAT,
  WITHOUT_CATALOG_SLUG,
  catalogCategoryPath,
  catalogProductPath,
  invalidateCatalogQueries,
  productFormValues,
  productRequestBody,
  toCents,
  useCatalogData,
  type Catalog,
  type Product,
  type ProductFormSubmit,
} from './catalogShared'
import { Select } from '@/components/ui/Select'

type CatalogFormData = {
  name: string
  sortOrder: string
  ncmCode: string
  cfopCode: string
  cstIcms: string
}

const EMPTY_CATALOG: CatalogFormData = { name: '', sortOrder: '0', ncmCode: '', cfopCode: '', cstIcms: '' }

/** Seleção da barra: todos (`null`), sem catálogo ou um catálogo — vem da URL. */
const WITHOUT_CATALOG = '__none__'

function formatBRL(value: string | number) {
  return formatMoney(toCents(value), MONEY_FORMAT)
}

export function CatalogPage() {
  return (
    <CatalogProductsProvider>
      <CatalogPageContent />
    </CatalogProductsProvider>
  )
}

function CatalogPageContent() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const navigate = useNavigate()
  // A categoria é página: `/catalog/categoria/:catalogId` (ou `sem-catalogo`); `/catalog` é "Todos".
  const { catalogId: catalogParam } = useParams<{ catalogId?: string }>()
  const selectedCatId =
    catalogParam === undefined ? null : catalogParam === WITHOUT_CATALOG_SLUG ? WITHOUT_CATALOG : catalogParam

  // Modal de catálogo
  const [catModal, setCatModal] = useState<'create' | 'edit' | 'delete' | null>(null)
  const [selectedCat, setSelectedCat] = useState<Catalog | null>(null)
  const [catForm, setCatForm] = useState<CatalogFormData>(EMPTY_CATALOG)
  const [catError, setCatError] = useState<string | null>(null)

  // Product modal
  const [prodModal, setProdModal] = useState<'create' | 'edit' | 'delete' | null>(null)
  const [selectedProd, setSelectedProd] = useState<Product | null>(null)
  // Preenche o `ProductForm` em modo de criação com os dados de outro produto — variação de
  // tamanho/sabor é o caso comum, e redigitar tudo de novo é o que a duplicação evita.
  const [duplicateSource, setDuplicateSource] = useState<Product | null>(null)
  const [prodError, setProdError] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(false)

  // O `ProductForm` do SDK pede o código de barras por promessa; o `BarcodeScanner` daqui é um
  // componente com callbacks. O resolver guardado aqui é a ponte entre os dois modelos.
  const scanResolver = useRef<((suggestion: ProductSuggestion | null) => void) | null>(null)

  const invalidate = () => invalidateCatalogQueries(queryClient)

  const { catalogs, products: allProducts, sections } = useCatalogData()
  // Todos os produtos de uma vez: a chave não muda com o filtro, então navegar entre categorias não refaz a chamada.
  const { costByProductId, isLoading: isLoadingCosts } = useRecipeCosts(allProducts)
  const selectedCatalog = catalogs.find((catalog) => catalog.id === selectedCatId) ?? null

  const [productSearch, setProductSearch] = useState('')
  const [productStatus, setProductStatus] = useState<ProductStatusFilter | ''>('')
  const [productSectionId, setProductSectionId] = useState('')
  const [productSort, setProductSort] = useState<ProductSort>('menu')

  const catalogProducts = selectedCatId === null
    ? allProducts
    : selectedCatId === WITHOUT_CATALOG
    ? allProducts.filter((p) => p.catalogId === null)
    : allProducts.filter((p) => p.catalogId === selectedCatId)

  const visibleProducts = filterAndSortProducts(catalogProducts, {
    search: productSearch,
    status: productStatus,
    sectionId: productSectionId,
    sort: productSort,
  })
  const hasProductFilters = !!productSearch.trim() || !!productStatus || !!productSectionId

  // Mutations de catálogo
  const createCat = useMutation({
    mutationFn: (body: unknown) => api.post('/catalog/catalogs', body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeCatModal() },
    onError: (e: Error) => setCatError(e.message),
  })
  const updateCat = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api.put(`/catalog/catalogs/${id}`, body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeCatModal() },
    onError: (e: Error) => setCatError(e.message),
  })
  const deleteCat = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/catalogs/${id}`, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeCatModal(); navigate(CATALOG_PATH) },
    onError: (e: Error) => setCatError(e.message),
  })

  // Product mutations
  const createProd = useMutation({
    mutationFn: (body: unknown) => api.post('/catalog/products', body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeProdModal() },
    onError: (e: Error) => setProdError(e.message),
  })
  const updateProd = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api.put(`/catalog/products/${id}`, body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeProdModal() },
    onError: (e: Error) => setProdError(e.message),
  })
  const toggleProd = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/catalog/products/${id}/toggle-active`, {}, accessToken ?? undefined),
    onSuccess: invalidate,
  })
  const deleteProd = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/products/${id}`, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeProdModal() },
    onError: (e: Error) => setProdError(e.message),
  })

  function openCreateCat() {
    setCatForm(EMPTY_CATALOG)
    setCatError(null)
    setCatModal('create')
  }

  function openEditCat(cat: Catalog) {
    setSelectedCat(cat)
    setCatForm({
      name: cat.name,
      sortOrder: String(cat.sortOrder),
      ncmCode: cat.ncmCode ?? '',
      cfopCode: cat.cfopCode ?? '',
      cstIcms: cat.cstIcms ?? '',
    })
    setCatError(null)
    setCatModal('edit')
  }

  function openDeleteCat(cat: Catalog) {
    setSelectedCat(cat)
    setCatError(null)
    setCatModal('delete')
  }

  function closeCatModal() {
    setCatModal(null)
    setSelectedCat(null)
    setCatForm(EMPTY_CATALOG)
    setCatError(null)
  }

  function submitCat() {
    const body = {
      name: catForm.name,
      sortOrder: parseInt(catForm.sortOrder) || 0,
      ncmCode: catForm.ncmCode || undefined,
      cfopCode: catForm.cfopCode || undefined,
      cstIcms: catForm.cstIcms || undefined,
    }
    if (catModal === 'create') createCat.mutate(body)
    else if (catModal === 'edit' && selectedCat) updateCat.mutate({ id: selectedCat.id, body })
    else if (catModal === 'delete' && selectedCat) deleteCat.mutate(selectedCat.id)
  }

  function openCreateProd() {
    setSelectedProd(null)
    setDuplicateSource(null)
    setProdError(null)
    setProdModal('create')
  }

  function openEditProd(prod: Product) {
    setSelectedProd(prod)
    setProdError(null)
    setProdModal('edit')
  }

  function openDuplicateProd(prod: Product) {
    setSelectedProd(null)
    setDuplicateSource(prod)
    setProdError(null)
    setProdModal('create')
  }

  function openDeleteProd(prod: Product) {
    setSelectedProd(prod)
    setProdError(null)
    setProdModal('delete')
  }

  function closeProdModal() {
    setProdModal(null)
    setSelectedProd(null)
    setDuplicateSource(null)
    setProdError(null)
  }

  function deleteSelectedProd() {
    if (selectedProd) deleteProd.mutate(selectedProd.id)
  }

  const submitProduct = useCallback(
    async (data: ProductFormSubmit) => {
      setProdError(null)
      const body = productRequestBody(data)
      try {
        if (selectedProd) await updateProd.mutateAsync({ id: selectedProd.id, body })
        else await createProd.mutateAsync(body)
      } catch {
        // `onError` da mutation já preencheu `prodError`; o formulário só precisa parar de salvar.
      }
    },
    [selectedProd, updateProd, createProd]
  )

  const searchSuggestions = useCallback(
    (query: string) =>
      api.get<ProductSuggestion[]>(
        `/catalog/product-search?q=${encodeURIComponent(query)}`,
        accessToken ?? undefined
      ),
    [accessToken]
  )

  const requestBarcodeScan = useCallback(
    () =>
      new Promise<ProductSuggestion | null>((resolve) => {
        scanResolver.current = resolve
        setShowScanner(true)
      }),
    []
  )

  function finishBarcodeScan(suggestion: ProductSuggestion | null) {
    setShowScanner(false)
    scanResolver.current?.(suggestion)
    scanResolver.current = null
  }

  async function handleBarcodeScan(barcode: string) {
    try {
      const found = await api.get<ProductSuggestion | null>(
        `/catalog/product-lookup/${barcode}`,
        accessToken ?? undefined
      )
      finishBarcodeScan(found ?? { name: '', barcode })
    } catch {
      // Código não está na base externa: vale o número lido, o nome o usuário digita.
      finishBarcodeScan({ name: '', barcode })
    }
  }

  const isCatPending = createCat.isPending || updateCat.isPending || deleteCat.isPending

  const sdkCatalogs = catalogs.map((cat) => ({
    id: cat.id,
    name: cat.name,
    description: null,
    active: cat.active,
  }))

  // Seção aqui é posto de produção (cozinha, bar), válido para todo o catálogo — daí `catalogId`
  // ausente, que o SDK lê como "não filtrar por catálogo".
  const sdkSections = sections.map((section) => ({ id: section.id, name: section.name }))

  const sdkInitialProduct = selectedProd
    ? productFormValues(selectedProd)
    : duplicateSource
    ? {
        name: `${duplicateSource.name} (cópia)`,
        description: duplicateSource.description,
        priceInCents: toCents(duplicateSource.price),
        costPriceInCents: duplicateSource.costPrice === null ? null : toCents(duplicateSource.costPrice),
        // Código de barras identifica uma unidade física específica — copiar geraria duplicidade
        // no mesmo lookup que o T3.1 usa para achar produto por código.
        barcode: null,
        unit: duplicateSource.unit,
        catalogId: duplicateSource.catalogId,
        sectionId: duplicateSource.sectionId,
      }
    : { catalogId: selectedCatId === WITHOUT_CATALOG ? null : selectedCatId }

  const withoutCatalogCount = allProducts.filter((p) => p.catalogId === null).length
  const inactiveCount = catalogProducts.filter((product) => !product.active).length

  const catModalTitle =
    catModal === 'create' ? 'Novo catálogo' : catModal === 'edit' ? `Editar · ${selectedCat?.name}` : 'Excluir catálogo'
  const prodModalTitle =
    prodModal === 'create'
      ? duplicateSource
        ? `Duplicar · ${duplicateSource.name}`
        : 'Novo produto'
      : prodModal === 'edit'
      ? `Editar · ${selectedProd?.name}`
      : 'Excluir produto'

  return (
    <div className="flex flex-col md:flex-row h-full min-h-screen">
      {/* Left panel — catalogs (no celular fica em cima, com rolagem própria, e a lista ganha a largura toda) */}
      <div className="w-full md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50 flex flex-col max-h-80 md:max-h-none overflow-y-auto md:overflow-visible">
        <div className="px-4 py-4 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Catálogos</p>
          <button
            onClick={openCreateCat}
            className="flex items-center justify-center gap-2 w-full py-2 text-xs font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Novo catálogo
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <CatalogNavLink
            to={CATALOG_PATH}
            label="Todos"
            count={allProducts.length}
            selected={selectedCatId === null}
          />

          {catalogs.map((cat) => (
            <CatalogNavLink
              key={cat.id}
              to={catalogCategoryPath(cat.id)}
              label={cat.name}
              count={allProducts.filter((p) => p.catalogId === cat.id).length}
              selected={selectedCatId === cat.id}
              inactive={!cat.active}
            />
          ))}

          {withoutCatalogCount > 0 && (
            <CatalogNavLink
              to={catalogCategoryPath(null)}
              label="Sem catálogo"
              count={withoutCatalogCount}
              selected={selectedCatId === WITHOUT_CATALOG}
              muted
            />
          )}

          <div className="px-4">
            <SectionManager />
            <Link
              to="/stock"
              className="mt-2 flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              <Boxes className="h-4 w-4" aria-hidden="true" />
              Insumos e estoque
            </Link>
          </div>
        </div>
      </div>

      {/* Right panel — products */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            {selectedCatId !== null && (
              <nav aria-label="Caminho" className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                <Link to={CATALOG_PATH} className="hover:text-brand-600">Cardápio</Link>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
                <span>Categoria</span>
              </nav>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900">
                {selectedCatId === null
                  ? 'Todos os produtos'
                  : selectedCatId === WITHOUT_CATALOG
                  ? 'Sem catálogo'
                  : (selectedCatalog?.name ?? 'Categoria não encontrada')}
              </h1>
              {selectedCatalog && !selectedCatalog.active && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Inativa</span>
              )}
              {selectedCatalog && (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditCat(selectedCatalog)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-gray-100"
                    title="Editar categoria"
                    aria-label="Editar categoria"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeleteCat(selectedCatalog)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100"
                    title="Excluir categoria"
                    aria-label="Excluir categoria"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">
              {hasProductFilters
                ? `${visibleProducts.length} de ${catalogProducts.length} produto${catalogProducts.length !== 1 ? 's' : ''}`
                : `${catalogProducts.length} produto${catalogProducts.length !== 1 ? 's' : ''}`}
              {catalogProducts.length > 0 && inactiveCount > 0 && ` · ${inactiveCount} inativo${inactiveCount !== 1 ? 's' : ''}`}
            </p>
            <StockAlertBadges className="mt-1" />
          </div>
          <button
            onClick={openCreateProd}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Novo produto
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-4 md:px-6 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <SearchField value={productSearch} onChange={setProductSearch} placeholder="Nome, descrição ou código de barras" />
          <FilterField label="Status" className="w-full sm:w-32">
            <FilterSelect value={productStatus} onChange={setProductStatus} options={PRODUCT_STATUS_OPTIONS} />
          </FilterField>
          <FilterField label="Seção" className="w-full sm:w-40">
            <FilterSelect
              value={productSectionId}
              onChange={setProductSectionId}
              options={[
                ...sections.map((section) => ({ value: section.id, label: section.name })),
                { value: NO_SECTION, label: 'Sem seção' },
              ]}
              allLabel="Todas"
            />
          </FilterField>
          <FilterField label="Ordenar por" className="w-full sm:w-44">
            <Select
              size="sm"
              value={productSort}
              onChange={setProductSort}
              ariaLabel="Ordenar"
              options={PRODUCT_SORT_OPTIONS}
            />
          </FilterField>
          {hasProductFilters && (
            <button
              type="button"
              onClick={() => {
                setProductSearch('')
                setProductStatus('')
                setProductSectionId('')
              }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {visibleProducts.length === 0 ? (
            <p className="text-gray-400 text-center py-16">
              {hasProductFilters ? 'Nenhum produto com esses filtros' : 'Nenhum produto neste catálogo'}
            </p>
          ) : (
            <div className="grid gap-3">
              {visibleProducts.map((prod) => {
                const cat = catalogs.find((c) => c.id === prod.catalogId)
                const sec = sections.find((s) => s.id === prod.sectionId)
                const imageUrl = productImageUrl(productImagePath(prod.id, prod.imageVersion))
                return (
                  <div
                    key={prod.id}
                    className={`bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ${!prod.active ? 'opacity-60' : ''}`}
                  >
                    {imageUrl && (
                      <Link to={catalogProductPath(prod.id)} className="shrink-0" tabIndex={-1} aria-hidden="true">
                        <img
                          src={imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-14 w-14 rounded-lg object-cover border border-gray-100"
                        />
                      </Link>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={catalogProductPath(prod.id)}
                          className="font-semibold text-gray-900 break-words hover:text-brand-600 hover:underline"
                        >
                          {prod.name}
                        </Link>
                        {!prod.active && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Inativo</span>
                        )}
                        {cat && selectedCatId !== cat.id && (
                          <Link
                            to={catalogCategoryPath(cat.id)}
                            className="text-xs px-2 py-0.5 bg-brand-50 text-brand-600 rounded-full hover:bg-brand-100"
                          >
                            {cat.name}
                          </Link>
                        )}
                        {sec && (
                          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full">{sec.name}</span>
                        )}
                      </div>
                      {prod.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{prod.description}</p>
                      )}
                      {prod.barcode && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          Cód: {formatBarcode(prod.barcode)}
                        </p>
                      )}
                    </div>
                    <div className="sm:text-right flex-shrink-0">
                      <p className="font-bold text-gray-900">{formatBRL(prod.price)}</p>
                      <RecipeCostBadge cost={costByProductId.get(prod.id)} isLoading={isLoadingCosts} />
                      {prod.costPrice && (
                        <p className="text-xs text-gray-300 mt-0.5">
                          Custo cadastrado {formatBRL(prod.costPrice)} · margem{' '}
                          {formatMarginPercent(toCents(prod.costPrice), toCents(prod.price))}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                      <Link
                        to={catalogProductPath(prod.id)}
                        className="px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                      >
                        Detalhes
                      </Link>
                      <button
                        onClick={() => openEditProd(prod)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => openDuplicateProd(prod)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Duplicar
                      </button>
                      <button
                        onClick={() => toggleProd.mutate(prod.id)}
                        disabled={toggleProd.isPending}
                        className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                          prod.active
                            ? 'text-orange-600 border-orange-200 hover:bg-orange-50'
                            : 'text-green-600 border-green-200 hover:bg-green-50'
                        }`}
                      >
                        {prod.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => openDeleteProd(prod)}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de catálogo */}
      <Modal open={catModal !== null} onClose={closeCatModal} title={catModalTitle} size="sm">
            <div className="p-5 space-y-4">
              {catModal === 'delete' ? (
                <p className="text-sm text-gray-600">
                  Excluir <strong>{selectedCat?.name}</strong>? Os produtos associados ficam sem catálogo.
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input
                      type="text"
                      value={catForm.name}
                      onChange={(e) => setCatForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Bebidas"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ordem</label>
                    <input
                      type="number"
                      min="0"
                      value={catForm.sortOrder}
                      onChange={(e) => setCatForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-xs font-medium text-gray-500">{FISCAL_SECTION_TITLE}</p>
                      <button
                        type="button"
                        onClick={() => setCatForm((prev) => ({ ...prev, ...FISCAL_DEFAULTS }))}
                        className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0"
                      >
                        <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {FISCAL_APPLY_DEFAULTS_LABEL}
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{FISCAL_SECTION_HELP}</p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">NCM</label>
                        <input
                          type="text"
                          value={catForm.ncmCode}
                          onChange={(e) => setCatForm((prev) => ({ ...prev, ncmCode: e.target.value }))}
                          placeholder={FISCAL_DEFAULTS.ncmCode}
                          maxLength={8}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">{FISCAL_FIELD_HINTS.ncmCode}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">CFOP</label>
                        <input
                          type="text"
                          value={catForm.cfopCode}
                          onChange={(e) => setCatForm((prev) => ({ ...prev, cfopCode: e.target.value }))}
                          placeholder={FISCAL_DEFAULTS.cfopCode}
                          maxLength={4}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">{FISCAL_FIELD_HINTS.cfopCode}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">CST ICMS</label>
                        <input
                          type="text"
                          value={catForm.cstIcms}
                          onChange={(e) => setCatForm((prev) => ({ ...prev, cstIcms: e.target.value }))}
                          placeholder={FISCAL_DEFAULTS.cstIcms}
                          maxLength={3}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">{FISCAL_FIELD_HINTS.cstIcms}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {catError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{catError}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={closeCatModal} className="flex-1 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50">Cancelar</button>
                <button
                  onClick={submitCat}
                  disabled={isCatPending}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50 ${catModal === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                >
                  {isCatPending ? 'Aguarde...' : catModal === 'delete' ? 'Excluir' : catModal === 'edit' ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
      </Modal>

      {/* Product modal */}
      <Modal open={prodModal !== null} onClose={closeProdModal} title={prodModalTitle} size="md">
            <div className="p-5 space-y-4">
              {prodModal === 'delete' ? (
                <p className="text-sm text-gray-600">
                  Excluir <strong>{selectedProd?.name}</strong>? Esta ação não pode ser desfeita.
                </p>
              ) : (
                <>
                  <ProductForm
                    key={selectedProd?.id ?? duplicateSource?.id ?? 'new'}
                    catalogs={sdkCatalogs}
                    sections={sdkSections}
                    initialValues={sdkInitialProduct}
                    onSubmit={submitProduct}
                    onScanBarcode={requestBarcodeScan}
                    onSearchSuggestions={searchSuggestions}
                  />
                  {prodModal === 'edit' && selectedProd && (
                    <ProductPhotoManager
                      productId={selectedProd.id}
                      productName={selectedProd.name}
                      imageVersion={allProducts.find((product) => product.id === selectedProd.id)?.imageVersion ?? null}
                      onChanged={invalidate}
                    />
                  )}
                  {prodModal === 'edit' && selectedProd && (
                    <ProductRecipeEditor
                      productId={selectedProd.id}
                      productName={selectedProd.name}
                      price={selectedProd.price}
                    />
                  )}
                </>
              )}
              {prodError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{prodError}</p>}
              {/* Criar e editar têm o botão de submit dentro do próprio `ProductForm`. */}
              {prodModal === 'delete' && (
                <div className="flex gap-3 pt-1">
                  <button onClick={closeProdModal} className="flex-1 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50">Cancelar</button>
                  <button
                    onClick={deleteSelectedProd}
                    disabled={deleteProd.isPending}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50 bg-red-600 text-white hover:bg-red-700"
                  >
                    {deleteProd.isPending ? 'Aguarde...' : 'Excluir'}
                  </button>
                </div>
              )}
            </div>
      </Modal>
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => finishBarcodeScan(null)}
        />
      )}
    </div>
  )
}

interface CatalogNavLinkProps {
  to: string
  label: string
  count: number
  selected: boolean
  inactive?: boolean
  muted?: boolean
}

/** Item da barra: nome e contador na mesma linha (o nome encurta com "…", o número não cai). */
function CatalogNavLink({ to, label, count, selected, inactive = false, muted = false }: CatalogNavLinkProps) {
  return (
    <Link
      to={to}
      aria-current={selected ? 'page' : undefined}
      className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors ${
        selected ? 'bg-brand-50 text-brand-700 font-medium' : muted ? 'text-gray-500 hover:bg-gray-100' : 'text-gray-700 hover:bg-gray-100'
      } ${inactive ? 'opacity-50' : ''}`}
    >
      <span className={`truncate min-w-0 ${muted ? 'italic' : ''}`}>{label}</span>
      <span className="shrink-0 text-xs text-gray-400 tabular-nums">{count}</span>
    </Link>
  )
}
