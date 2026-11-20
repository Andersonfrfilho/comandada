import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChefHat, Minus, Plus, Search, X } from 'lucide-react'
import { api } from '@/lib/api'
import { formatBRL, matchesSearch } from '@/lib/listing'
import { productImagePath, productImageUrl } from '@/lib/productImage'
import { orderNumberLabel } from '@/lib/orderLabel'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  addToCart,
  cartCount,
  cartTotal,
  changeQuantity,
  productDisplayName,
  setLineNotes,
  tableOrderBody,
  waiterPaths,
  type CartLine,
  type WaiterBill,
  type WaiterMenu,
  type WaiterProduct,
} from './waiterModel'

const ALL_CATEGORIES = '__all__'

function draftKey(comandaId: string): string {
  return `waiter-cart:${comandaId}`
}

function loadDraft(comandaId: string): CartLine[] {
  try {
    const raw = localStorage.getItem(draftKey(comandaId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as CartLine[]) : []
  } catch {
    return []
  }
}

function saveDraft(comandaId: string, cart: CartLine[]): void {
  try {
    if (cart.length === 0) localStorage.removeItem(draftKey(comandaId))
    else localStorage.setItem(draftKey(comandaId), JSON.stringify(cart))
  } catch {
    // Sem armazenamento: o carrinho só não sobrevive a recarregar a página.
  }
}

/** Lançar itens: cardápio por categoria com busca, "+" grande e observação por item; envia direto à cozinha. */
export function WaiterLaunchPage() {
  const { comandaId = '' } = useParams()
  const accessToken = useAuthStore((state) => state.accessToken) ?? undefined
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [cart, setCart] = useState<CartLine[]>(() => loadDraft(comandaId))
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const [search, setSearch] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [orderNotes, setOrderNotes] = useState('')

  useEffect(() => saveDraft(comandaId, cart), [comandaId, cart])

  const { data: bill } = useQuery({
    queryKey: ['comanda-bill', comandaId],
    queryFn: () => api.get<WaiterBill>(`/comandas/${comandaId}/bill`, accessToken),
  })
  const { data: menu, isLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: () => api.get<WaiterMenu>('/menu', accessToken),
    staleTime: 60_000,
  })

  const catalogs = useMemo(() => {
    if (!menu) return []
    const list = menu.catalogs.filter((catalog) => catalog.products.length > 0)
    return menu.withoutCatalog.length > 0 ? [...list, { id: '__none__', name: 'Outros', products: menu.withoutCatalog }] : list
  }, [menu])

  const visibleProducts = useMemo(() => {
    const term = search.trim()
    const source = category === ALL_CATEGORIES ? catalogs : catalogs.filter((catalog) => catalog.id === category)
    return source
      .map((catalog) => ({
        ...catalog,
        products: term
          ? catalog.products.filter((product) => matchesSearch(term, [productDisplayName(product), product.description]))
          : catalog.products,
      }))
      .filter((catalog) => catalog.products.length > 0)
  }, [catalogs, category, search])

  const quantityByProduct = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of cart) map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity)
    return map
  }, [cart])

  const sendOrder = useMutation({
    mutationFn: () => {
      if (!bill) throw new Error('Comanda não carregada')
      return api.post<{ id: string; number?: number | null }>(
        '/orders',
        tableOrderBody({ tableId: bill.comanda.tableId, comandaId, cart, notes: orderNotes }),
        accessToken
      )
    },
    onSuccess: (order) => {
      toast.success(`Pedido ${orderNumberLabel(order)} enviado para a cozinha`)
      setCart([])
      saveDraft(comandaId, [])
      void queryClient.invalidateQueries({ queryKey: ['comanda-bill', comandaId] })
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      navigate(waiterPaths.comanda(comandaId), { replace: true })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o pedido'),
  })

  function add(product: WaiterProduct) {
    setCart((current) => addToCart(current, product))
    try {
      navigator.vibrate?.(15)
    } catch {
      // Sem vibração.
    }
  }

  function removeOne(product: WaiterProduct) {
    // Tira primeiro da linha sem observação; se só houver com observação, da última.
    setCart((current) => {
      const lines = current.filter((line) => line.productId === product.id)
      const target = lines.find((line) => !line.notes) ?? lines[lines.length - 1]
      return target ? changeQuantity(current, target.key, -1) : current
    })
  }

  const count = cartCount(cart)
  const total = cartTotal(cart)

  return (
    <div className="pb-32">
      <div
        className="sticky z-20 bg-gray-50/95 px-3 pb-2 pt-2 backdrop-blur"
        style={{ top: 'calc(3.5rem + env(safe-area-inset-top))' }}
      >
        <div className="mb-2 flex items-center gap-2">
          <Link
            to={waiterPaths.comanda(comandaId)}
            aria-label="Voltar à comanda"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-gray-200"
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              {bill ? `Mesa ${bill.comanda.tableNumber}` : 'Mesa'}
            </p>
            <p className="truncate text-base font-bold leading-tight">{bill?.comanda.customerName ?? 'Lançar itens'}</p>
          </div>
        </div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar no cardápio"
            className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-9 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-gray-400">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 py-1">
          {[{ id: ALL_CATEGORIES, name: 'Tudo' }, ...catalogs].map((catalog) => (
            <button
              key={catalog.id}
              onClick={() => setCategory(catalog.id)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold ${
                category === catalog.id ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-300'
              }`}
            >
              {catalog.name}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : visibleProducts.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">Nada no cardápio com esse nome.</p>
        ) : (
          visibleProducts.map((catalog) => (
            <section key={catalog.id} className="mb-4">
              {category === ALL_CATEGORIES && (
                <h2 className="mb-2 mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">{catalog.name}</h2>
              )}
              <ul className="space-y-2">
                {catalog.products.map((product) => {
                  const quantity = quantityByProduct.get(product.id) ?? 0
                  const photo = productImageUrl(productImagePath(product.id, product.imageVersion))
                  return (
                    <li
                      key={product.id}
                      className={`flex items-center gap-3 rounded-2xl bg-white p-2 pr-2.5 shadow-sm ring-1 ${
                        quantity > 0 ? 'ring-brand-400' : 'ring-gray-300'
                      }`}
                    >
                      <button onClick={() => add(product)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        {photo ? (
                          <img src={photo} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                        ) : (
                          <div className="h-14 w-14 shrink-0 rounded-xl bg-gray-100" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-snug">{productDisplayName(product)}</p>
                          <p className="text-sm font-bold tabular-nums text-brand-700">{formatBRL(product.price)}</p>
                        </div>
                      </button>
                      {quantity > 0 && (
                        <>
                          <button
                            onClick={() => removeOne(product)}
                            aria-label={`Tirar um ${productDisplayName(product)}`}
                            className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 active:scale-90"
                          >
                            <Minus className="h-5 w-5" />
                          </button>
                          <span className="w-6 text-center text-lg font-black tabular-nums">{quantity}</span>
                        </>
                      )}
                      <button
                        onClick={() => add(product)}
                        aria-label={`Adicionar ${productDisplayName(product)}`}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white active:scale-90"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {count > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto max-w-2xl">
            {reviewing && (
              <div className="max-h-[55vh] overflow-y-auto px-3 pt-3">
                <ul className="divide-y divide-gray-100">
                  {cart.map((line) => (
                    <li key={line.key} className="py-2.5">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 text-sm font-semibold">{line.productName}</p>
                        <button
                          onClick={() => setCart((current) => changeQuantity(current, line.key, -1))}
                          aria-label={`Tirar um ${line.productName}`}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 active:scale-90"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-6 text-center font-black tabular-nums">{line.quantity}</span>
                        <button
                          onClick={() => setCart((current) => changeQuantity(current, line.key, 1))}
                          aria-label={`Mais um ${line.productName}`}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 active:scale-90"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <input
                        defaultValue={line.notes}
                        onBlur={(event) => setCart((current) => setLineNotes(current, line.key, event.target.value))}
                        placeholder="Observação (ex.: sem cebolinha)"
                        className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </li>
                  ))}
                </ul>
                <textarea
                  value={orderNotes}
                  onChange={(event) => setOrderNotes(event.target.value)}
                  placeholder="Observação para a cozinha (pedido todo)"
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}
            <div className="flex items-center gap-2 p-3">
              <button
                onClick={() => setReviewing((value) => !value)}
                className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-left ring-1 ring-gray-300 active:scale-[0.98]"
                aria-expanded={reviewing}
              >
                <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-sm font-black text-white">
                  {count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] leading-tight text-gray-500">{reviewing ? 'Fechar' : 'Revisar / observação'}</span>
                  <span className="block text-base font-bold tabular-nums leading-tight">{formatBRL(total)}</span>
                </span>
                <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${reviewing ? '' : 'rotate-180'}`} />
              </button>
              <button
                onClick={() => sendOrder.mutate()}
                disabled={sendOrder.isPending || !bill || bill.comanda.status !== 'open'}
                className="flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-4 text-base font-bold text-white active:scale-95 disabled:opacity-50"
              >
                <ChefHat className="h-5 w-5" />
                {sendOrder.isPending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
