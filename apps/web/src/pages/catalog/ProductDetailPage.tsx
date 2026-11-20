import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ChevronRight, Package } from 'lucide-react'
import { ProductForm, formatBarcode, formatMarginPercent } from '@adatechnology/products-ui'
import { api } from '@/lib/api'
import { formatBRL, formatDateTime, formatDecimal, formatMinutes, formatPercent } from '@/lib/listing'
import { useAuthStore, useCan } from '@/stores/authStore'
import { confirmDialog } from '@/stores/confirmStore'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ProductPhotoManager } from './components/ProductPhotoManager'
import { RecipeManager, RecipeCostBadge } from './components/RecipeManager'
import {
  CATALOG_PATH,
  CatalogProductsProvider,
  UNIT_LABELS,
  catalogCategoryPath,
  catalogProductPath,
  invalidateCatalogQueries,
  productFormValues,
  productRequestBody,
  toCents,
  useCatalogData,
  type Product,
  type ProductFormSubmit,
} from './catalogShared'
import { hasUnitMismatch, portionsAvailable, portionsFromIngredient, type RecipeStockLine } from './productStock'

interface Ingredient {
  id: string
  name: string
  unit: string
  stockQuantity: string
  minimumStock: string | null
}

interface ProductIngredient {
  id: string
  ingredientId: string
  quantity: string
  unit: string
  notes: string | null
}

interface PriceChange {
  id: string
  previousPrice: string
  newPrice: string
  createdAt: string
  user: { id: string; name: string } | null
}

interface Affinity {
  id: string
  confidence: string
  coOccurrenceCount: number
  suggestedProduct: { id: string; name: string; price: string; active: boolean } | null
}

export function ProductDetailPage() {
  return (
    <CatalogProductsProvider>
      <ProductDetailContent />
    </CatalogProductsProvider>
  )
}

function ProductDetailContent() {
  const { productId = '' } = useParams<{ productId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const canDelete = useCan({ resource: 'products', action: 'delete' })

  const { catalogs, products, sections, isLoadingProducts } = useCatalogData()
  const product = products.find((candidate) => candidate.id === productId) ?? null
  const catalog = catalogs.find((candidate) => candidate.id === product?.catalogId) ?? null
  const section = sections.find((candidate) => candidate.id === product?.sectionId) ?? null

  const [editing, setEditing] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const invalidate = () => invalidateCatalogQueries(queryClient)

  const updateProduct = useMutation({
    mutationFn: (body: unknown) => api.put(`/catalog/products/${productId}`, body, accessToken),
    onSuccess: () => {
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ['product-price-history', productId] })
      setEditing(false)
      toast.success('Produto salvo')
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const toggleActive = useMutation({
    mutationFn: () => api.patch(`/catalog/products/${productId}/toggle-active`, {}, accessToken),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  })

  const deleteProduct = useMutation({
    mutationFn: () => api.delete(`/catalog/products/${productId}`, accessToken),
    onSuccess: () => {
      invalidate()
      toast.success('Produto excluído')
      navigate(product ? catalogCategoryPath(product.catalogId) : CATALOG_PATH, { replace: true })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const submitProduct = useCallback(
    async (data: ProductFormSubmit) => {
      setFormError(null)
      try {
        await updateProduct.mutateAsync(productRequestBody(data))
      } catch {
        // `onError` já mostrou o erro; o formulário só precisa parar de salvar.
      }
    },
    [updateProduct]
  )

  async function askDelete() {
    if (!product) return
    const confirmed = await confirmDialog({
      title: 'Excluir produto',
      message: `Excluir ${product.name}? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    })
    if (confirmed) deleteProduct.mutate()
  }

  if (!product) {
    return (
      <div className="p-6 max-w-lg">
        <Link to={CATALOG_PATH} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Voltar ao cardápio
        </Link>
        <p className="mt-6 text-gray-500">{isLoadingProducts ? 'Carregando…' : 'Produto não encontrado.'}</p>
      </div>
    )
  }

  const categoryLabel = catalog?.name ?? 'Sem catálogo'

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Caminho e ações */}
      <div className="space-y-3">
        <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1 text-sm text-gray-400">
          <Link to={CATALOG_PATH} className="hover:text-brand-600">Cardápio</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link to={catalogCategoryPath(product.catalogId)} className="hover:text-brand-600">{categoryLabel}</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-gray-600 truncate max-w-[16rem]">{product.name}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 break-words">{product.name}</h1>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  product.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {product.active ? 'Ativo no cardápio' : 'Inativo'}
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatBRL(product.price)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => { setFormError(null); setEditing(true) }}>
              Editar
            </Button>
            <Button
              variant="secondary"
              loading={toggleActive.isPending}
              onClick={() => toggleActive.mutate()}
            >
              {product.active ? 'Desativar' : 'Ativar'}
            </Button>
            {canDelete && (
              <Button variant="ghost" className="text-red-600 hover:bg-red-50" loading={deleteProduct.isPending} onClick={askDelete}>
                Excluir
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        {/* Foto */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 self-start">
          <ProductPhotoManager
            productId={product.id}
            productName={product.name}
            imageVersion={product.imageVersion}
            onChanged={invalidate}
          />
        </div>

        <div className="space-y-6 min-w-0">
          <PriceCard product={product} />

          <Card title="Dados do produto">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
              <Field label="Categoria">
                <Link to={catalogCategoryPath(product.catalogId)} className="text-brand-600 hover:underline">
                  {categoryLabel}
                </Link>
              </Field>
              <Field label="Seção de preparo">{section?.name ?? '—'}</Field>
              <Field label="Unidade de venda">{UNIT_LABELS[product.unit] ?? product.unit}</Field>
              <Field label="Código de barras">{product.barcode ? formatBarcode(product.barcode) : '—'}</Field>
              <Field label="Tempo de preparo">
                {product.preparationTimeMinutes ? formatMinutes(product.preparationTimeMinutes) : '—'}
              </Field>
              <Field label="Ordem no cardápio">{product.sortOrder}</Field>
            </dl>
            <div className="mt-4 space-y-3 text-sm">
              <Field label="Descrição">
                <p className="whitespace-pre-line text-gray-700">{product.description || '—'}</p>
              </Field>
              {product.preparationInstructions && (
                <Field label="Instruções de preparo">
                  <p className="whitespace-pre-line text-gray-700">{product.preparationInstructions}</p>
                </Field>
              )}
            </div>
          </Card>
        </div>
      </div>

      <StockCard productId={product.id} />

      <div className="grid gap-6 md:grid-cols-2">
        <PriceHistoryCard productId={product.id} />
        <AffinitiesCard productId={product.id} />
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={`Editar · ${product.name}`} size="md">
        <div className="p-5 space-y-4">
          <ProductForm
            key={product.id}
            catalogs={catalogs.map((item) => ({ id: item.id, name: item.name, description: null, active: item.active }))}
            sections={sections.map((item) => ({ id: item.id, name: item.name }))}
            initialValues={productFormValues(product)}
            onSubmit={submitProduct}
          />
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{formError}</p>}
        </div>
      </Modal>
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-800 break-words">{children}</dd>
    </div>
  )
}

function PriceCard({ product }: { product: Product }) {
  return (
    <Card title="Preço e margem">
      <dl className="grid gap-3 grid-cols-2 sm:grid-cols-3 text-sm">
        <Field label="Preço de venda">
          <span className="font-semibold">{formatBRL(product.price)}</span>
        </Field>
        <Field label="Custo cadastrado">{product.costPrice ? formatBRL(product.costPrice) : '—'}</Field>
        <Field label="Margem">
          {product.costPrice ? formatMarginPercent(toCents(product.costPrice), toCents(product.price)) : '—'}
        </Field>
      </dl>
      <RecipeCostBadge productId={product.id} productPrice={product.price} costPrice={product.costPrice} />
    </Card>
  )
}

/** Estoque do produto pela ficha técnica: saldo de cada ingrediente e quantas porções ainda rende. */
function StockCard({ productId }: { productId: string }) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api.get<Ingredient[]>('/ingredients', accessToken),
  })
  const { data: recipe = [], isLoading } = useQuery({
    queryKey: ['product-ingredients', productId],
    queryFn: () => api.get<ProductIngredient[]>(`/ingredients/product/${productId}`, accessToken),
  })

  const rows = recipe.map((line) => {
    const ingredient = ingredients.find((candidate) => candidate.id === line.ingredientId)
    const stockLine: RecipeStockLine = {
      stockQuantity: Number(ingredient?.stockQuantity ?? 0),
      stockUnit: ingredient?.unit ?? line.unit,
      quantityPerPortion: Number(line.quantity),
      recipeUnit: line.unit,
    }
    const minimum = ingredient?.minimumStock ? Number(ingredient.minimumStock) : null
    return {
      line,
      ingredient,
      stockLine,
      portions: portionsFromIngredient(stockLine),
      low: minimum !== null && stockLine.stockQuantity <= minimum,
    }
  })
  const available = portionsAvailable(rows.map((row) => row.stockLine))
  const unitMismatch = rows.some((row) => hasUnitMismatch(row.stockLine))

  return (
    <Card
      title="Estoque e ficha técnica"
      action={
        available !== null && (
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
              available === 0 ? 'bg-red-50 text-red-700' : available <= 5 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'
            }`}
          >
            {available === 0 ? 'Sem estoque para produzir' : `Rende ${formatDecimal(available, 0)} porç${available === 1 ? 'ão' : 'ões'}`}
          </span>
        )
      }
    >
      {isLoading ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="flex items-start gap-3 text-sm text-gray-500">
          <Package className="h-5 w-5 text-gray-300 shrink-0" aria-hidden="true" />
          <p>
            Sem ficha técnica. O estoque é controlado pelos ingredientes: cadastre a receita abaixo para ver quanto
            ainda dá para produzir e baixar o estoque a cada pedido.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full text-sm min-w-[32rem]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="font-medium py-2 px-4 md:px-0">Ingrediente</th>
                <th className="font-medium py-2 px-2 text-right">Por porção</th>
                <th className="font-medium py-2 px-2 text-right">Em estoque</th>
                <th className="font-medium py-2 px-4 md:px-0 text-right">Rende</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.line.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 px-4 md:px-0">
                    <span className="text-gray-800">{row.ingredient?.name ?? 'Ingrediente removido'}</span>
                    {row.line.notes && <span className="block text-xs text-gray-400">{row.line.notes}</span>}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-600">
                    {formatDecimal(row.stockLine.quantityPerPortion, 3)} {row.line.unit}
                    {hasUnitMismatch(row.stockLine) && (
                      <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-amber-500 align-[-2px]" aria-label="Unidade diferente do estoque" />
                    )}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.low ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                    {formatDecimal(row.stockLine.stockQuantity, 2)} {row.stockLine.stockUnit}
                  </td>
                  <td className="py-2 px-4 md:px-0 text-right tabular-nums text-gray-800">
                    {row.portions === null ? '—' : formatDecimal(row.portions, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unitMismatch && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Alguma linha da ficha está numa unidade diferente da do ingrediente. A baixa do estoque usa o número como
          está, na unidade do ingrediente: confira a quantidade.
        </p>
      )}
      <p className="mt-3 text-xs text-gray-400">
        Entrada, perda e lotes de cada ingrediente ficam em Ingredientes, na barra do cardápio.
      </p>
      <RecipeManager productId={productId} />
    </Card>
  )
}

function PriceHistoryCard({ productId }: { productId: string }) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['product-price-history', productId],
    queryFn: () => api.get<PriceChange[]>(`/catalog/products/${productId}/price-history`, accessToken),
  })

  return (
    <Card title="Histórico de preço">
      {isLoading ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-400">O preço não mudou desde o cadastro.</p>
      ) : (
        <ul className="divide-y divide-gray-50 text-sm">
          {history.slice(0, 10).map((change) => (
            <li key={change.id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="tabular-nums">
                <span className="text-gray-400 line-through">{formatBRL(change.previousPrice)}</span>{' '}
                <span className="font-medium text-gray-800">{formatBRL(change.newPrice)}</span>
              </span>
              <span className="text-xs text-gray-400">
                {formatDateTime(change.createdAt)}
                {change.user ? ` · ${change.user.name}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function AffinitiesCard({ productId }: { productId: string }) {
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const { data: affinities = [], isLoading } = useQuery({
    queryKey: ['product-affinities', productId],
    queryFn: () => api.get<Affinity[]>(`/catalog/products/${productId}/affinities`, accessToken),
  })
  const visible = affinities.filter((affinity) => affinity.suggestedProduct !== null)

  return (
    <Card title="Costuma sair junto">
      {isLoading ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400">Ainda sem pedidos suficientes para sugerir.</p>
      ) : (
        <ul className="divide-y divide-gray-50 text-sm">
          {visible.map((affinity) => {
            const suggested = affinity.suggestedProduct!
            return (
              <li key={affinity.id} className="py-2 flex items-center justify-between gap-3">
                <Link
                  to={catalogProductPath(suggested.id)}
                  className={`truncate hover:text-brand-600 hover:underline ${suggested.active ? 'text-gray-800' : 'text-gray-400'}`}
                >
                  {suggested.name}
                </Link>
                <span className="shrink-0 text-xs text-gray-400 tabular-nums">
                  em {formatPercent(Number(affinity.confidence) * 100, 0)} dos pedidos
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
