import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Clock, Instagram, MapPin, Minus, Plus, Search, ShoppingBag, X } from 'lucide-react'
import { applyBranding, toBranding } from '@/lib/branding'
import { formatBRL } from '@/lib/listing'
import { storefrontApi, type StorefrontItem, type StorefrontMenu } from './storefrontApi'
import { addToCart, cartCount, cartTotal, changeQuantity, hoursLabel, normalizeSearch, type CartLine } from './storefrontFormat'
import { storefrontStorage } from './storefrontStorage'
import { CheckoutSheet } from './CheckoutSheet'
import { BottomSheet } from './BottomSheet'

const NOTE_MAX_LENGTH = 140

/**
 * Cardápio online: o cliente lê o cardápio do restaurante (o mesmo do bot) e faz o pedido sem login.
 * Celular primeiro: categorias fixas no topo, carrinho fixo embaixo, checkout numa folha só.
 */
export function StorefrontPage() {
  const { establishmentId } = useParams<{ establishmentId?: string }>()
  const { data: menu, isLoading, isError, refetch } = useQuery({
    queryKey: ['storefront-menu', establishmentId ?? 'host'],
    queryFn: () => storefrontApi.menu(establishmentId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })

  useEffect(() => {
    if (!menu) return
    applyBranding(toBranding({ name: menu.establishment.name, logo: menu.establishment.logo, primaryColor: menu.establishment.primaryColor }))
  }, [menu])

  if (isLoading) return <MenuSkeleton />
  if (isError || !menu) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold text-gray-800">Não conseguimos abrir o cardápio agora.</p>
        <button type="button" onClick={() => void refetch()} className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white">
          Tentar de novo
        </button>
      </div>
    )
  }
  return <StorefrontMenuView menu={menu} />
}

function StorefrontMenuView({ menu }: { menu: StorefrontMenu }) {
  const establishmentId = menu.establishment.id
  const [lines, setLines] = useState<CartLine[]>(() => storefrontStorage.loadCart(establishmentId))
  const [selectedItem, setSelectedItem] = useState<StorefrontItem | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [search, setSearch] = useState('')
  const recentOrder = useMemo(() => storefrontStorage.loadRecentOrder(establishmentId), [establishmentId])

  // Item que saiu do cardápio não pode seguir no carrinho guardado no aparelho.
  const priceById = useMemo(() => {
    const prices = new Map<string, number>()
    for (const category of menu.categories) for (const item of category.items) for (const option of item.options) prices.set(option.productId, option.price)
    return prices
  }, [menu])
  useEffect(() => {
    setLines((current) =>
      current
        .filter((line) => priceById.has(line.productId))
        .map((line) => ({ ...line, unitPrice: priceById.get(line.productId) ?? line.unitPrice }))
    )
  }, [priceById])
  useEffect(() => storefrontStorage.saveCart(establishmentId, lines), [establishmentId, lines])

  const quantityByProduct = useMemo(() => {
    const quantities = new Map<string, number>()
    for (const line of lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity)
    return quantities
  }, [lines])

  const visibleCategories = useMemo(() => {
    const term = normalizeSearch(search)
    if (!term) return menu.categories
    return menu.categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => normalizeSearch(`${item.name} ${item.description ?? ''} ${category.name}`).includes(term)),
      }))
      .filter((category) => category.items.length > 0)
  }, [menu.categories, search])

  function quickAdd(item: StorefrontItem) {
    const option = item.options[0]
    if (item.options.length !== 1 || !option) {
      setSelectedItem(item)
      return
    }
    setLines((current) => addToCart(current, { productId: option.productId, name: item.name, unitPrice: option.price, quantity: 1, notes: '' }))
  }

  function quickRemove(item: StorefrontItem) {
    const option = item.options[0]
    if (!option) return
    const line = [...lines].reverse().find((candidate) => candidate.productId === option.productId)
    if (line) setLines((current) => changeQuantity(current, line.lineId, line.quantity - 1))
  }

  const count = cartCount(lines)
  const total = cartTotal(lines)

  return (
    <div className="min-h-screen bg-stone-50 pb-28">
      <MenuHeader menu={menu} />

      {recentOrder && (
        <div className="mx-auto max-w-2xl px-4 pt-4">
          <Link
            to={`/cardapio/pedido/${recentOrder.orderId}?t=${encodeURIComponent(recentOrder.token)}`}
            className="flex items-center justify-between rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm shadow-sm"
          >
            <span className="font-medium text-gray-800">
              Acompanhar meu pedido{recentOrder.number ? ` #${recentOrder.number}` : ''}
            </span>
            <ChevronRight className="h-4 w-4 text-brand-600" />
          </Link>
        </div>
      )}

      <CategoryNav categories={visibleCategories.map((category) => category.name)} search={search} onSearch={setSearch} />

      <main className="mx-auto max-w-2xl px-4">
        {visibleCategories.length === 0 && (
          <p className="py-16 text-center text-sm text-gray-500">Nada encontrado para “{search}”.</p>
        )}
        {visibleCategories.map((category) => (
          <section key={category.name} id={sectionId(category.name)} data-category={category.name} className="scroll-mt-32 pt-6">
            <h2 className="mb-3 text-lg font-bold tracking-tight text-gray-900">{category.name}</h2>
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70">
              {category.items.map((item) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  quantity={item.options.reduce((sum, option) => sum + (quantityByProduct.get(option.productId) ?? 0), 0)}
                  onOpen={() => setSelectedItem(item)}
                  onAdd={() => quickAdd(item)}
                  onRemove={() => quickRemove(item)}
                />
              ))}
            </ul>
          </section>
        ))}
        <MenuFooter menu={menu} />
      </main>

      {count > 0 && !checkoutOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-stone-50 via-stone-50/95 to-transparent">
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 text-white shadow-lg shadow-brand-600/30 active:scale-[0.99] transition"
          >
            <span className="flex items-center gap-3">
              <span className="relative">
                <ShoppingBag className="h-5 w-5" />
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-brand-700">
                  {count}
                </span>
              </span>
              <span className="font-semibold">Ver carrinho</span>
            </span>
            <span className="font-semibold tabular-nums">{formatBRL(total)}</span>
          </button>
        </div>
      )}

      {selectedItem && (
        <ItemSheet
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAdd={(line) => {
            setLines((current) => addToCart(current, line))
            setSelectedItem(null)
          }}
        />
      )}

      {checkoutOpen && (
        <CheckoutSheet
          menu={menu}
          lines={lines}
          onChangeLines={setLines}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </div>
  )
}

function sectionId(categoryName: string): string {
  return `cat-${normalizeSearch(categoryName).replace(/[^a-z0-9]+/g, '-')}`
}

function MenuHeader({ menu }: { menu: StorefrontMenu }) {
  const { establishment, delivery } = menu
  const initials = establishment.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
  const location = [establishment.address, establishment.city].filter(Boolean).join(' · ')
  const deliveryText = menu.orderTypes.includes('delivery') && delivery
    ? delivery.byDistance
      ? `Entrega a partir de ${formatBRL(delivery.baseFee)}`
      : delivery.baseFee > 0 ? `Entrega ${formatBRL(delivery.baseFee)}` : 'Entrega grátis'
    : null

  return (
    <header className="relative overflow-hidden bg-brand-700 text-white">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand-500/40 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-brand-400/30 blur-2xl" />
      <div className="relative mx-auto max-w-2xl px-4 pb-6 pt-8">
        <div className="flex items-center gap-4">
          {establishment.logo ? (
            <img src={establishment.logo} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-md" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-bold text-brand-700 shadow-md">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold leading-tight">{establishment.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
              <span className={`inline-block h-2 w-2 rounded-full ${establishment.isOpen ? 'bg-emerald-300' : 'bg-red-300'}`} />
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {hoursLabel(establishment, new Date())}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {deliveryText && <Chip>{deliveryText}</Chip>}
          {delivery?.freeAbove && menu.orderTypes.includes('delivery') && <Chip>Grátis acima de {formatBRL(delivery.freeAbove)}</Chip>}
          {menu.orderTypes.includes('retirada') && <Chip>Retirada no local</Chip>}
          {establishment.minOrderValue > 0 && <Chip>Pedido mínimo {formatBRL(establishment.minOrderValue)}</Chip>}
        </div>
        {location && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-white/80">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {location}
          </p>
        )}
        {!establishment.isOpen && (
          <p className="mt-4 rounded-xl bg-white/15 px-3 py-2 text-sm">
            {establishment.closedMessage ?? 'Estamos fechados agora, mas você já pode olhar o cardápio e montar o pedido.'}
          </p>
        )}
      </div>
    </header>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/15 px-3 py-1 font-medium backdrop-blur-sm">{children}</span>
}

function CategoryNav({ categories, search, onSearch }: { categories: string[]; search: string; onSearch: (value: string) => void }) {
  const [active, setActive] = useState(categories[0] ?? '')
  const navRef = useRef<HTMLDivElement>(null)

  // Categoria em destaque segue a rolagem da página.
  useEffect(() => {
    const sections = categories
      .map((name) => document.getElementById(sectionId(name)))
      .filter((section): section is HTMLElement => Boolean(section))
    if (sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)
        const name = visible[0]?.target.getAttribute('data-category')
        if (name) setActive(name)
      },
      { rootMargin: '-140px 0px -60% 0px' }
    )
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [categories])

  useEffect(() => {
    const chip = navRef.current?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(active)}"]`)
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])

  return (
    <div className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
      <div className="mx-auto max-w-2xl px-4 pt-3">
        <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand-500">
          <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar no cardápio"
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-gray-400 sm:text-sm"
            aria-label="Buscar no cardápio"
          />
          {search && (
            <button type="button" onClick={() => onSearch('')} aria-label="Limpar busca">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </label>
      </div>
      <div ref={navRef} className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            data-chip={name}
            onClick={() => {
              setActive(name)
              document.getElementById(sectionId(name))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              active === name ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-gray-700 ring-1 ring-stone-200'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

function priceLabel(item: StorefrontItem): string {
  const prices = item.options.map((option) => option.price)
  const lowest = Math.min(...prices)
  return item.options.length > 1 && prices.some((price) => price !== lowest) ? `a partir de ${formatBRL(lowest)}` : formatBRL(lowest)
}

function ItemRow({
  item,
  quantity,
  onOpen,
  onAdd,
  onRemove,
}: {
  item: StorefrontItem
  quantity: number
  onOpen: () => void
  onAdd: () => void
  onRemove: () => void
}) {
  const singleOption = item.options.length === 1
  return (
    <li className="flex items-start gap-3 px-4 py-4">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="font-semibold text-gray-900">{item.name}</p>
        {item.description && <p className="mt-1 line-clamp-2 text-sm leading-snug text-gray-500">{item.description}</p>}
        {item.options.length > 1 && (
          <p className="mt-1 text-xs text-gray-500">{item.options.map((option) => option.label ?? '').filter(Boolean).join(' · ')}</p>
        )}
        <p className="mt-2 text-sm font-semibold text-brand-700">{priceLabel(item)}</p>
      </button>
      <div className="flex shrink-0 items-center self-center">
        {quantity > 0 && singleOption ? (
          <div className="flex items-center gap-1 rounded-full bg-brand-50 p-1 ring-1 ring-brand-200">
            <button type="button" onClick={onRemove} aria-label={`Tirar um ${item.name}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center text-sm font-bold tabular-nums text-brand-700">{quantity}</span>
            <button type="button" onClick={onAdd} aria-label={`Adicionar mais um ${item.name}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Adicionar ${item.name}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/25 active:scale-95 transition"
          >
            <Plus className="h-5 w-5" />
            {quantity > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-900 px-1 text-[11px] font-bold">
                {quantity}
              </span>
            )}
          </button>
        )}
      </div>
    </li>
  )
}

function ItemSheet({
  item,
  onClose,
  onAdd,
}: {
  item: StorefrontItem
  onClose: () => void
  onAdd: (line: Omit<CartLine, 'lineId'>) => void
}) {
  const [optionId, setOptionId] = useState(item.options[0]?.productId ?? '')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const option = item.options.find((candidate) => candidate.productId === optionId) ?? item.options[0]
  if (!option) return null

  return (
    <BottomSheet title={item.name} onClose={onClose}>
      <div className="space-y-5 px-5 pb-4">
        {item.description && <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">{item.description}</p>}

        {item.options.length > 1 && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-gray-900">Escolha o tamanho</legend>
            <div className="space-y-2">
              {item.options.map((candidate) => (
                <label
                  key={candidate.productId}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 ring-1 transition ${
                    candidate.productId === option.productId ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-stone-200'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="option"
                      checked={candidate.productId === option.productId}
                      onChange={() => setOptionId(candidate.productId)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="font-medium text-gray-900">{candidate.label ?? item.name}</span>
                  </span>
                  <span className="text-sm font-semibold text-gray-700">{formatBRL(candidate.price)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-gray-900">
            Alguma observação? <span className="font-normal text-gray-400">(opcional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, NOTE_MAX_LENGTH))}
            rows={2}
            placeholder="Ex.: sem cebolinha"
            className="w-full resize-none rounded-xl bg-white px-3 py-2.5 text-[16px] ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm"
          />
        </label>
      </div>
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-stone-200 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-1 rounded-full bg-stone-100 p-1">
          <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Diminuir" className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-7 text-center font-bold tabular-nums">{quantity}</span>
          <button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} aria-label="Aumentar" className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() =>
            onAdd({
              productId: option.productId,
              name: option.label && item.options.length > 1 ? `${item.name} (${option.label})` : item.name,
              unitPrice: option.price,
              quantity,
              notes,
            })
          }
          className="flex flex-1 items-center justify-between rounded-2xl bg-brand-600 px-5 py-3.5 font-semibold text-white shadow-md shadow-brand-600/25"
        >
          <span>Adicionar</span>
          <span className="tabular-nums">{formatBRL(option.price * quantity)}</span>
        </button>
      </div>
    </BottomSheet>
  )
}

function MenuFooter({ menu }: { menu: StorefrontMenu }) {
  const { establishment } = menu
  const instagram = establishment.instagram?.replace(/^@/, '')
  return (
    <footer className="mt-10 space-y-2 pb-6 text-center text-xs text-gray-400">
      {instagram && (
        <a href={`https://instagram.com/${instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gray-500">
          <Instagram className="h-3.5 w-3.5" /> @{instagram}
        </a>
      )}
      <p>Preços e disponibilidade podem mudar sem aviso.</p>
    </footer>
  )
}

function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="h-44 animate-pulse bg-gray-300" />
      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-2xl bg-white ring-1 ring-stone-200" />
        ))}
      </div>
    </div>
  )
}
