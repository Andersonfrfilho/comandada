import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Plus, Wand2 } from 'lucide-react'
import {
  FISCAL_DEFAULTS,
  FISCAL_FIELD_HINTS,
  FISCAL_SECTION_TITLE,
  FISCAL_SECTION_HELP,
  FISCAL_APPLY_DEFAULTS_LABEL,
} from '@/constants/fiscalDefaults'
import { SectionManager } from './components/SectionManager'
import { IngredientManager } from './components/IngredientManager'
import { RecipeManager, RecipeCostBadge } from './components/RecipeManager'
import { BarcodeScanner } from './components/BarcodeScanner'
import { ExpiringBatchBadge } from './components/StockBatchList'
import {
  ProductForm,
  ProductsProvider,
  PRODUCT_OPTIONAL_FIELD,
  formatBarcode,
  formatMarginPercent,
  formatMoney,
  type CreateProductInput,
  type MoneyFormat,
  type ProductSuggestion,
} from '@adatechnology/products-ui'
import { productsApiAdapter } from '@/lib/productsApiAdapter'

const MONEY_FORMAT: MoneyFormat = { currency: 'BRL', locale: 'pt-BR' }

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

interface Catalog {
  id: string
  name: string
  slug: string
  active: boolean
  sortOrder: number
  ncmCode?: string
  cfopCode?: string
  cstIcms?: string
}

interface Section {
  id: string
  name: string
  description: string | null
}

interface Product {
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
}

type CatalogFormData = {
  name: string
  sortOrder: string
  ncmCode: string
  cfopCode: string
  cstIcms: string
}

const EMPTY_CATALOG: CatalogFormData = { name: '', sortOrder: '0', ncmCode: '', cfopCode: '', cstIcms: '' }

// A API guarda o preço como decimal em reais e o SDK formata centavo inteiro. A multiplicação
// arredondada mora só aqui — ver `productsApiAdapter` para o mesmo contrato do lado das mutações.
function toCents(value: string | number): number {
  return Math.round(Number(value) * 100)
}

function formatBRL(value: string | number) {
  return formatMoney(toCents(value), MONEY_FORMAT)
}

export function CatalogPage() {
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
      <CatalogPageContent />
    </ProductsProvider>
  )
}

function CatalogPageContent() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

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

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog-catalogs'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    void queryClient.invalidateQueries({ queryKey: ['menu'] })
    void queryClient.invalidateQueries({ queryKey: ['sections'] })
  }

  const { data: catalogs = [] } = useQuery({
    queryKey: ['catalog-catalogs'],
    queryFn: () => api.get<Catalog[]>('/catalog/catalogs', accessToken ?? undefined),
  })

  const { data: allProducts = [] } = useQuery({
    queryKey: ['catalog-products'],
    queryFn: () => api.get<Product[]>('/catalog/products', accessToken ?? undefined),
  })

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get('/sections', accessToken ?? undefined) as Promise<Section[]>,
  })

  const visibleProducts = selectedCatId === null
    ? allProducts
    : selectedCatId === '__none__'
    ? allProducts.filter((p) => p.catalogId === null)
    : allProducts.filter((p) => p.catalogId === selectedCatId)

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
    onSuccess: () => { invalidate(); closeCatModal(); setSelectedCatId(null) },
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

  // O SDK entrega centavos; a API espera reais.
  const submitProduct = useCallback(
    async (data: CreateProductInput & { active?: boolean; sortOrder?: number }) => {
      setProdError(null)
      const body = {
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
    ? {
        id: selectedProd.id,
        name: selectedProd.name,
        description: selectedProd.description,
        priceInCents: toCents(selectedProd.price),
        costPriceInCents: selectedProd.costPrice === null ? null : toCents(selectedProd.costPrice),
        unit: selectedProd.unit,
        barcode: selectedProd.barcode,
        catalogId: selectedProd.catalogId,
        sectionId: selectedProd.sectionId,
        preparationTimeMinutes: selectedProd.preparationTimeMinutes,
        preparationInstructions: selectedProd.preparationInstructions,
        sortOrder: selectedProd.sortOrder,
        active: selectedProd.active,
      }
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
        preparationTimeMinutes: duplicateSource.preparationTimeMinutes,
        preparationInstructions: duplicateSource.preparationInstructions,
      }
    : { catalogId: selectedCatId === '__none__' ? null : selectedCatId }

  const withoutCatalogCount = allProducts.filter((p) => p.catalogId === null).length

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
    <div className="flex h-full min-h-screen">
      {/* Left panel — catalogs */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
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
          <button
            onClick={() => setSelectedCatId(null)}
            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
              selectedCatId === null
                ? 'bg-brand-50 text-brand-700 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>Todos</span>
            <span className="float-right text-xs text-gray-400">{allProducts.length}</span>
          </button>

          {catalogs.map((cat) => {
            const count = allProducts.filter((p) => p.catalogId === cat.id).length
            return (
              <div key={cat.id} className="group relative">
                <button
                  onClick={() => setSelectedCatId(cat.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    selectedCatId === cat.id
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  } ${!cat.active ? 'opacity-50' : ''}`}
                >
                  <span className="truncate block pr-8">{cat.name}</span>
                  <span className="float-right text-xs text-gray-400">{count}</span>
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
                  <button
                    onClick={() => openEditCat(cat)}
                    className="p-1 text-gray-400 hover:text-brand-600"
                    title="Editar"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => openDeleteCat(cat)}
                    className="p-1 text-gray-400 hover:text-red-500"
                    title="Excluir"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}

          {withoutCatalogCount > 0 && (
            <button
              onClick={() => setSelectedCatId('__none__')}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                selectedCatId === '__none__'
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <span className="italic">Sem catálogo</span>
              <span className="float-right text-xs text-gray-400">{withoutCatalogCount}</span>
            </button>
          )}

          <div className="px-4">
            <SectionManager />
            <IngredientManager />
          </div>
        </div>
      </div>

      {/* Right panel — products */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {selectedCatId === null
                ? 'Todos os produtos'
                : selectedCatId === '__none__'
                ? 'Sem catálogo'
                : (catalogs.find((c) => c.id === selectedCatId)?.name ?? '')}
            </h1>
            <p className="text-sm text-gray-400">{visibleProducts.length} produto{visibleProducts.length !== 1 ? 's' : ''}</p>
            <ExpiringBatchBadge className="mt-1" />
          </div>
          <button
            onClick={openCreateProd}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Novo produto
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {visibleProducts.length === 0 ? (
            <p className="text-gray-400 text-center py-16">Nenhum produto neste catálogo</p>
          ) : (
            <div className="grid gap-3">
              {visibleProducts.map((prod) => {
                const cat = catalogs.find((c) => c.id === prod.catalogId)
                const sec = sections.find((s) => s.id === prod.sectionId)
                return (
                  <div
                    key={prod.id}
                    className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 ${!prod.active ? 'opacity-60' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">{prod.name}</span>
                        {!prod.active && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Inativo</span>
                        )}
                        {cat && (
                          <span className="text-xs px-2 py-0.5 bg-brand-50 text-brand-600 rounded-full">{cat.name}</span>
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
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-gray-900">{formatBRL(prod.price)}</p>
                      <RecipeCostBadge
                        productId={prod.id}
                        productPrice={prod.price}
                        costPrice={prod.costPrice}
                      />
                      {prod.costPrice && (
                        <p className="text-xs text-gray-300 mt-0.5">
                          Custo cadastrado {formatBRL(prod.costPrice)} · margem{' '}
                          {formatMarginPercent(toCents(prod.costPrice), toCents(prod.price))}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
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
                    <RecipeManager productId={selectedProd.id} />
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
