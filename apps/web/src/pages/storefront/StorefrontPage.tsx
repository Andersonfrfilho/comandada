import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Instagram, MapPin, Minus, Plus, RotateCcw, Search, ShoppingBag, Trash2, X } from 'lucide-react'
import { applyBranding, toBranding } from '@/lib/branding'
import { formatBRL } from '@/lib/listing'
import { productImageUrl } from '@/lib/productImage'
import { storefrontApi, type StorefrontItem, type StorefrontMenu } from './storefrontApi'
import { addToCart, cartCount, cartTotal, changeQuantity, hoursLabel, normalizeSearch, type CartLine } from './storefrontFormat'
import { storefrontStorage, type LastOrderItems } from './storefrontStorage'
import { CheckoutSheet } from './CheckoutSheet'
import { BottomSheet } from './BottomSheet'
import { CARD, DISPLAY_FONT, STOREFRONT_CREAM, STOREFRONT_INK, useDisplayFont } from './storefrontTheme'

const NOTE_MAX_LENGTH = 140
const FEATURED_LIMIT = 8
const FEATURED_MINIMUM = 3

/**
 * Cardápio online: o cliente lê o cardápio do restaurante (o mesmo do bot) e faz o pedido sem login.
 * Celular primeiro: categorias fixas no topo, carrinho fixo embaixo, checkout numa folha só.
 * No computador o carrinho fica ao lado do cardápio.
 */
export function StorefrontPage() {
  const { establishmentId } = useParams<{ establishmentId?: string }>()
  useDisplayFont()
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
      <div className={`flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center ${STOREFRONT_CREAM}`}>
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
  const lastOrder = useMemo(() => storefrontStorage.loadLastOrderItems(establishmentId), [establishmentId])

  // Item que saiu do cardápio não pode seguir no carrinho guardado no aparelho.
  const priceById = useMemo(() => {
    const prices = new Map<string, number>()
    for (const category of menu.categories) for (const item of category.items) for (const option of item.options) prices.set(option.productId, option.price)
    return prices
  }, [menu])
  const imageByProduct = useMemo(() => {
    const images = new Map<string, string>()
    for (const category of menu.categories) {
      for (const item of category.items) {
        const url = productImageUrl(item.image)
        if (url) for (const option of item.options) images.set(option.productId, url)
      }
    }
    return images
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

  // Destaques: os primeiros itens com foto, na ordem do cardápio. Sem fotos suficientes, não aparece.
  const featured = useMemo(() => {
    const withPhoto = menu.categories.flatMap((category) => category.items.filter((item) => item.image))
    return withPhoto.length >= FEATURED_MINIMUM ? withPhoto.slice(0, FEATURED_LIMIT) : []
  }, [menu.categories])

  // Peça de novo: só os itens que ainda estão no cardápio, com o preço de hoje.
  const reorderLines = useMemo(() => {
    if (!lastOrder) return []
    return lastOrder.lines
      .filter((line) => priceById.has(line.productId))
      .map((line) => ({ ...line, unitPrice: priceById.get(line.productId) ?? line.unitPrice }))
  }, [lastOrder, priceById])

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

  function repeatLastOrder() {
    setLines((current) => reorderLines.reduce((cart, line) => addToCart(cart, line), current))
    setCheckoutOpen(true)
  }

  const count = cartCount(lines)
  const total = cartTotal(lines)
  const searching = normalizeSearch(search).length > 0

  return (
    <div className={`min-h-screen pb-28 text-[#1c120d] lg:pb-12 ${STOREFRONT_CREAM}`}>
      <MenuHeader menu={menu} />
      <BrandStripes />

      <CategoryNav
        categories={visibleCategories.map((category) => ({
          name: category.name,
          image: productImageUrl(category.items.find((item) => item.image)?.image),
        }))}
        search={search}
        onSearch={setSearch}
      />

      <div className="mx-auto max-w-6xl px-4 lg:flex lg:items-start lg:gap-8">
        <main className="min-w-0 flex-1">
          {recentOrder && (
            <Link
              to={`/cardapio/pedido/${recentOrder.orderId}?t=${encodeURIComponent(recentOrder.token)}`}
              className={`mt-5 flex items-center justify-between px-4 py-3 text-sm ${CARD}`}
            >
              <span className="font-medium text-gray-800">
                Acompanhar meu pedido{recentOrder.number ? ` #${recentOrder.number}` : ''}
              </span>
              <ChevronRight className="h-4 w-4 text-brand-700" />
            </Link>
          )}

          {!searching && reorderLines.length > 0 && lastOrder && (
            <ReorderCard lastOrder={lastOrder} lines={reorderLines} image={imageFor(reorderLines, imageByProduct)} onRepeat={repeatLastOrder} />
          )}

          {!searching && featured.length > 0 && (
            <section className="pt-7" aria-labelledby="destaques">
              <h2 id="destaques" className={`mb-3 text-2xl font-semibold ${DISPLAY_FONT}`}>Destaques</h2>
              <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
                {featured.map((item) => (
                  <FeaturedCard key={item.key} item={item} onOpen={() => setSelectedItem(item)} onAdd={() => quickAdd(item)} />
                ))}
              </ul>
            </section>
          )}

          {visibleCategories.length === 0 && (
            <p className="py-16 text-center text-sm text-gray-500">Nada encontrado para “{search}”.</p>
          )}
          {visibleCategories.map((category) => (
            <section key={category.name} id={sectionId(category.name)} data-category={category.name} className="scroll-mt-36 pt-7">
              <h2 className={`mb-3 text-2xl font-semibold ${DISPLAY_FONT}`}>{category.name}</h2>
              <ul className="grid gap-3 xl:grid-cols-2">
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

        <CartPanel menu={menu} lines={lines} onChangeLines={setLines} onCheckout={() => setCheckoutOpen(true)} />
      </div>

      {count > 0 && !checkoutOpen && (
        <div className={`fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#fbf4ea] via-[#fbf4ea]/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden`}>
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className={`mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl px-5 py-4 text-[#fbebd3] shadow-lg shadow-black/25 transition active:scale-[0.99] ${STOREFRONT_INK}`}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[13px] font-bold text-white">{count}</span>
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

function imageFor(lines: CartLine[], imageByProduct: Map<string, string>): string | null {
  for (const line of lines) {
    const image = imageByProduct.get(line.productId)
    if (image) return image
  }
  return null
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
    <header className={`text-[#fbebd3] ${STOREFRONT_INK}`}>
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-7 sm:pt-9">
        <div className="flex items-center gap-4 sm:gap-6">
          {establishment.logo ? (
            <img src={establishment.logo} alt="" className="h-20 w-24 shrink-0 object-contain sm:h-24 sm:w-32" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h1 className={`text-xl font-semibold uppercase leading-tight tracking-[0.1em] sm:text-4xl sm:tracking-[0.12em] ${DISPLAY_FONT}`}>{establishment.name}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  establishment.isOpen ? 'bg-emerald-950/70 text-emerald-200' : 'bg-red-950/70 text-red-200'
                }`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${establishment.isOpen ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {hoursLabel(establishment, new Date())}
              </span>
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          {deliveryText && <Chip>{deliveryText}</Chip>}
          {delivery?.freeAbove && menu.orderTypes.includes('delivery') && <Chip>Grátis acima de {formatBRL(delivery.freeAbove)}</Chip>}
          {menu.orderTypes.includes('retirada') && <Chip>Retirada no local</Chip>}
          {establishment.minOrderValue > 0 && <Chip>Pedido mínimo {formatBRL(establishment.minOrderValue)}</Chip>}
        </div>
        {location && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-[#d9c4aa]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {location}
          </p>
        )}
        {!establishment.isOpen && (
          <p className="mt-4 rounded-xl bg-white/10 px-3 py-2 text-sm">
            {establishment.closedMessage ?? 'Estamos fechados agora, mas você já pode olhar o cardápio e montar o pedido.'}
          </p>
        )}
      </div>
    </header>
  )
}

/** Três faixas na cor do restaurante embaixo do topo, como um pôr do sol. */
function BrandStripes() {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-[3px] ${STOREFRONT_INK}`}>
      <div className="h-1 bg-brand-400" />
      <div className="h-1 bg-brand-600" />
      <div className="h-1 bg-brand-700" />
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/10 px-3 py-1.5 font-medium">{children}</span>
}

interface CategoryChip {
  name: string
  image: string | null
}

function CategoryNav({ categories, search, onSearch }: { categories: CategoryChip[]; search: string; onSearch: (value: string) => void }) {
  const [active, setActive] = useState(categories[0]?.name ?? '')
  const navRef = useRef<HTMLDivElement>(null)
  const names = useMemo(() => categories.map((category) => category.name), [categories])

  // Categoria em destaque segue a rolagem da página.
  useEffect(() => {
    const sections = names
      .map((name) => document.getElementById(sectionId(name)))
      .filter((section): section is HTMLElement => Boolean(section))
    if (sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)
        const name = visible[0]?.target.getAttribute('data-category')
        if (name) setActive(name)
      },
      { rootMargin: '-160px 0px -60% 0px' }
    )
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [names])

  useEffect(() => {
    const chip = navRef.current?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(active)}"]`)
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])

  return (
    <div className="sticky top-0 z-20 border-b border-[#f0e2cf] bg-[#fbf4ea]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
        <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-[#e6d3bb] focus-within:ring-2 focus-within:ring-brand-500 lg:w-72 lg:shrink-0">
          <Search className="h-4 w-4 text-gray-500" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar no cardápio"
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-gray-500 sm:text-sm"
            aria-label="Buscar no cardápio"
          />
          {search && (
            <button type="button" onClick={() => onSearch('')} aria-label="Limpar busca">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </label>
        <div ref={navRef} className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
          {categories.map((category) => (
            <button
              key={category.name}
              type="button"
              data-chip={category.name}
              onClick={() => {
                setActive(category.name)
                document.getElementById(sectionId(category.name))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`flex shrink-0 items-center gap-2 rounded-full py-1 text-sm font-semibold transition ${category.image ? 'pl-1 pr-4' : 'px-4 py-2'} ${
                active === category.name ? `text-[#fbebd3] ${STOREFRONT_INK}` : 'bg-white text-[#1c120d] ring-1 ring-[#e6d3bb]'
              }`}
            >
              {category.image && <img src={category.image} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover" />}
              {category.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReorderCard({ lastOrder, lines, image, onRepeat }: { lastOrder: LastOrderItems; lines: CartLine[]; image: string | null; onRepeat: () => void }) {
  const names = lines.map((line) => (line.quantity > 1 ? `${line.quantity} ${line.name}` : line.name))
  const summary = names.length > 2 ? `${names.slice(0, 2).join(' + ')} +${names.length - 2}` : names.join(' + ')
  const when = new Date(lastOrder.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' })
  return (
    <section aria-label="Peça de novo" className={`mt-5 flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4 ${CARD}`}>
      {image ? (
        <img src={image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover sm:h-16 sm:w-16" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <RotateCcw className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Peça de novo</p>
        <p className="line-clamp-2 text-sm font-semibold sm:text-base">{summary}</p>
        <p className="text-xs text-[#6b574b] sm:text-sm">
          Último pedido, {when} · {formatBRL(cartTotal(lines))}
        </p>
      </div>
      <button type="button" onClick={onRepeat} className="h-11 shrink-0 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-sm active:scale-95 transition">
        Repetir
      </button>
    </section>
  )
}

function priceLabel(item: StorefrontItem): string {
  const prices = item.options.map((option) => option.price)
  const lowest = Math.min(...prices)
  return item.options.length > 1 && prices.some((price) => price !== lowest) ? `a partir de ${formatBRL(lowest)}` : formatBRL(lowest)
}

function optionsLabel(item: StorefrontItem): string | null {
  if (item.options.length < 2) return null
  const labels = item.options.map((option) => option.label ?? '').filter(Boolean)
  return labels.length ? labels.join(' ou ') : null
}

function FeaturedCard({ item, onOpen, onAdd }: { item: StorefrontItem; onOpen: () => void; onAdd: () => void }) {
  const imageUrl = productImageUrl(item.image)
  const detail = optionsLabel(item) ?? item.description
  return (
    <li className={`relative flex w-44 shrink-0 snap-start flex-col overflow-hidden sm:w-auto ${CARD}`}>
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left">
        {imageUrl && <img src={imageUrl} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full bg-stone-100 object-cover" />}
        <span className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2.5">
          <span className="font-semibold leading-snug">{item.name}</span>
          {detail && <span className="line-clamp-1 text-xs text-[#6b574b]">{detail}</span>}
          <span className="mt-auto pr-10 pt-1.5 text-[15px] font-bold">{priceLabel(item)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Adicionar ${item.name}`}
        className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow-md active:scale-95 transition"
      >
        <Plus className="h-4 w-4" />
      </button>
    </li>
  )
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
  const imageUrl = productImageUrl(item.image)
  const options = optionsLabel(item)
  return (
    <li className={`flex items-center gap-3 p-3.5 ${CARD}`}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{item.name}</span>
          {item.description && <span className="mt-1 line-clamp-2 block text-sm leading-snug text-[#6b574b]">{item.description}</span>}
          {options && <span className="mt-1 block text-xs text-[#6b574b]">{options}</span>}
          <span className="mt-2 block text-[15px] font-bold">{priceLabel(item)}</span>
        </span>
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-24 w-24 shrink-0 rounded-xl bg-stone-100 object-cover"
          />
        )}
      </button>
      <div className="flex shrink-0 items-center self-center">
        {quantity > 0 && singleOption ? (
          <div className="flex flex-col items-center gap-1 rounded-full bg-brand-50 p-1 ring-1 ring-brand-200">
            <button type="button" onClick={onAdd} aria-label={`Adicionar mais um ${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
              <Plus className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold tabular-nums text-brand-700">{quantity}</span>
            <button type="button" onClick={onRemove} aria-label={`Tirar um ${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
              <Minus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Adicionar ${item.name}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/25 transition active:scale-95"
          >
            <Plus className="h-5 w-5" />
            {quantity > 0 && (
              <span className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${STOREFRONT_INK}`}>
                {quantity}
              </span>
            )}
          </button>
        )}
      </div>
    </li>
  )
}

/** Carrinho ao lado do cardápio, só no computador; no celular ele é a barra de baixo. */
function CartPanel({
  menu,
  lines,
  onChangeLines,
  onCheckout,
}: {
  menu: StorefrontMenu
  lines: CartLine[]
  onChangeLines: (lines: CartLine[]) => void
  onCheckout: () => void
}) {
  const total = cartTotal(lines)
  const minimum = menu.establishment.minOrderValue
  const missing = minimum > 0 && total < minimum ? minimum - total : 0
  return (
    <aside aria-label="Seu pedido" className="sticky top-24 mt-7 hidden w-[360px] shrink-0 lg:block">
      <div className={`flex max-h-[calc(100vh-8rem)] flex-col p-5 ${CARD}`}>
        <h2 className={`text-2xl font-semibold ${DISPLAY_FONT}`}>Seu pedido</h2>
        {lines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[#6b574b]">
            <ShoppingBag className="h-8 w-8 text-brand-300" aria-hidden="true" />
            Escolha os itens no cardápio.
          </div>
        ) : (
          <>
            <ul className="mt-3 flex-1 divide-y divide-[#f3e8da] overflow-y-auto">
              {lines.map((line) => (
                <li key={line.lineId} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{line.name}</p>
                    {line.notes && <p className="text-xs italic text-[#6b574b]">{line.notes}</p>}
                    <p className="text-xs tabular-nums text-[#6b574b]">{formatBRL(line.unitPrice * line.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-[#f6ead9] p-1">
                    <button
                      type="button"
                      onClick={() => onChangeLines(changeQuantity(lines, line.lineId, line.quantity - 1))}
                      aria-label={line.quantity === 1 ? `Tirar ${line.name}` : `Diminuir ${line.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm"
                    >
                      {line.quantity === 1 ? <Trash2 className="h-3.5 w-3.5 text-red-600" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onChangeLines(changeQuantity(lines, line.lineId, line.quantity + 1))}
                      aria-label={`Aumentar ${line.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-dashed border-[#e0cdb4] pt-3 text-base font-bold">
              <span>Itens</span>
              <span className="tabular-nums">{formatBRL(total)}</span>
            </div>
            {missing > 0 && <p className="mt-1 text-xs text-[#6b574b]">Faltam {formatBRL(missing)} para o pedido mínimo.</p>}
            <button
              type="button"
              onClick={onCheckout}
              className="mt-4 h-12 rounded-xl bg-brand-600 text-base font-bold text-white shadow-md shadow-brand-600/25 transition active:scale-[0.99]"
            >
              Fechar pedido
            </button>
            <p className="mt-2 text-center text-xs text-[#6b574b]">Entrega, pagamento e seus dados na próxima tela.</p>
          </>
        )}
      </div>
    </aside>
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
        {item.image && (
          <img
            src={productImageUrl(item.image) ?? undefined}
            alt={item.name}
            className="aspect-[4/3] w-full rounded-2xl bg-stone-100 object-cover"
          />
        )}
        {item.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-[#4f3e34]">{item.description}</p>}

        {item.options.length > 1 && (
          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-[#6b574b]">Tamanho</legend>
            <div className="grid grid-cols-2 gap-2">
              {item.options.map((candidate) => {
                const checked = candidate.productId === option.productId
                return (
                  <label
                    key={candidate.productId}
                    className={`relative flex cursor-pointer flex-col gap-0.5 rounded-xl bg-white px-4 py-3 transition ${
                      checked ? 'ring-2 ring-brand-600' : 'ring-1 ring-[#e6d3bb]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="option"
                      checked={checked}
                      onChange={() => setOptionId(candidate.productId)}
                      className="absolute right-3 top-3 h-4 w-4 accent-brand-600"
                    />
                    <span className="pr-6 font-semibold">{candidate.label ?? item.name}</span>
                    <span className={`text-[15px] font-bold ${checked ? 'text-brand-700' : 'text-[#4f3e34]'}`}>{formatBRL(candidate.price)}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#6b574b]">
            Observação <span className="font-normal normal-case tracking-normal">(opcional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, NOTE_MAX_LENGTH))}
            rows={2}
            placeholder="Ex.: sem cebolinha"
            className="w-full resize-none rounded-xl bg-white px-3 py-2.5 text-[16px] outline-none ring-1 ring-[#e6d3bb] focus:ring-2 focus:ring-brand-500 sm:text-sm"
          />
        </label>
      </div>
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-[#f0e2cf] bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-1 rounded-full bg-[#f6ead9] p-1">
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
    <footer className="mt-10 space-y-2 pb-6 text-center text-xs text-[#6b574b]">
      {instagram && (
        <a href={`https://instagram.com/${instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
          <Instagram className="h-3.5 w-3.5" /> @{instagram}
        </a>
      )}
      <p>Preços e disponibilidade podem mudar sem aviso.</p>
    </footer>
  )
}

function MenuSkeleton() {
  return (
    <div className={`min-h-screen ${STOREFRONT_CREAM}`}>
      <div className={`h-48 ${STOREFRONT_INK}`} />
      <div className="mx-auto max-w-6xl space-y-3 px-4 pt-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={`h-24 animate-pulse ${CARD}`} />
        ))}
      </div>
    </div>
  )
}
