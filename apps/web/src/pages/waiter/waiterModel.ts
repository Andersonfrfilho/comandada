import type { OrderStatus } from '@/constants/orderLabels'

/** Rotas do app do garçom: tudo debaixo de /garcom, que é o escopo do manifest instalável. */
export const WAITER_BASE_PATH = '/garcom'
export const WAITER_MANIFEST_PATH = '/garcom.webmanifest'
export const PANEL_MANIFEST_PATH = '/manifest.webmanifest'

export const waiterPaths = {
  tables: WAITER_BASE_PATH,
  table: (tableId: string) => `${WAITER_BASE_PATH}/mesa/${tableId}`,
  comanda: (comandaId: string) => `${WAITER_BASE_PATH}/comanda/${comandaId}`,
  launch: (comandaId: string) => `${WAITER_BASE_PATH}/comanda/${comandaId}/lancar`,
}

export function isWaiterPath(pathname: string): boolean {
  return pathname === WAITER_BASE_PATH || pathname.startsWith(`${WAITER_BASE_PATH}/`)
}

export interface WaiterProduct {
  id: string
  name: string
  description: string | null
  price: string
  catalogId: string | null
  imageVersion?: string | null
  variantGroup?: string | null
  variantLabel?: string | null
}

export interface WaiterCatalog {
  id: string
  name: string
  products: WaiterProduct[]
}

export interface WaiterMenu {
  catalogs: WaiterCatalog[]
  withoutCatalog: WaiterProduct[]
}

export interface WaiterBillItem {
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  notes: string | null
  readyAt?: string | null
}

export interface WaiterBillOrder {
  id: string
  displayCode: string
  status: OrderStatus
  createdAt: string
  readyAt?: string | null
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  items: WaiterBillItem[]
}

export interface WaiterBill {
  comanda: {
    id: string
    code: string
    status: 'open' | 'closed' | 'paid'
    customerName: string | null
    customerPhone?: string | null
    guestsCount?: number | null
    billRequestedAt?: string | null
    openedAt: string
    closedAt: string | null
    tableId: string
    tableNumber: number
  }
  orders: WaiterBillOrder[]
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
}

export interface CartLine {
  /** Produto + observação: o mesmo prato com observação diferente é outra linha (igual ao bot). */
  key: string
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  notes: string
}

export function cartLineKey(productId: string, notes: string): string {
  return `${productId}::${notes.trim().toLowerCase()}`
}

export function addToCart(cart: CartLine[], product: WaiterProduct, notes = ''): CartLine[] {
  const key = cartLineKey(product.id, notes)
  const existing = cart.find((line) => line.key === key)
  if (existing) return cart.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line))
  return [
    ...cart,
    {
      key,
      productId: product.id,
      productName: productDisplayName(product),
      unitPrice: Number(product.price),
      quantity: 1,
      notes: notes.trim(),
    },
  ]
}

export function changeQuantity(cart: CartLine[], key: string, delta: number): CartLine[] {
  return cart
    .map((line) => (line.key === key ? { ...line, quantity: line.quantity + delta } : line))
    .filter((line) => line.quantity > 0)
}

export function setLineNotes(cart: CartLine[], key: string, notes: string): CartLine[] {
  const target = cart.find((line) => line.key === key)
  if (!target) return cart
  const newKey = cartLineKey(target.productId, notes)
  const merged = cart.find((line) => line.key === newKey && line.key !== key)
  if (merged) {
    return cart
      .filter((line) => line.key !== key)
      .map((line) => (line.key === newKey ? { ...line, quantity: line.quantity + target.quantity } : line))
  }
  return cart.map((line) => (line.key === key ? { ...line, key: newKey, notes: notes.trim() } : line))
}

export function cartTotal(cart: CartLine[]): number {
  return Math.round(cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) * 100) / 100
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.quantity, 0)
}

/** "Temaki salmão — Grande": o tamanho entra no nome para a cozinha não confundir. */
export function productDisplayName(product: WaiterProduct): string {
  return product.variantLabel && product.variantGroup ? `${product.variantGroup} — ${product.variantLabel}` : product.name
}

/** Corpo do POST /orders de um pedido de mesa (sem pagamento: paga na conta). */
export function tableOrderBody(input: { tableId: string; comandaId: string; cart: CartLine[]; notes: string }) {
  const notes = input.notes.trim()
  return {
    channel: 'manual' as const,
    type: 'table' as const,
    tableId: input.tableId,
    comandaId: input.comandaId,
    items: input.cart.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      ...(line.notes ? { notes: line.notes } : {}),
    })),
    payments: [],
    fiscalEnabled: false,
    ...(notes ? { notes } : {}),
  }
}

/** Situação do item para o garçom: o check da cozinha vale antes do status do pedido. */
export type ItemStage = 'waiting' | 'preparing' | 'ready' | 'served' | 'cancelled'

export function itemStage(order: Pick<WaiterBillOrder, 'status'>, item: Pick<WaiterBillItem, 'readyAt'>): ItemStage {
  if (order.status === 'cancelled') return 'cancelled'
  if (order.status === 'completed') return 'served'
  if (item.readyAt || order.status === 'ready') return 'ready'
  if (order.status === 'in_production') return 'preparing'
  return 'waiting'
}

export const ITEM_STAGE_LABELS: Record<ItemStage, string> = {
  waiting: 'Na fila',
  preparing: 'Preparando',
  ready: 'Pronto',
  served: 'Servido',
  cancelled: 'Cancelado',
}

/** Telefone digitado na mesa → só os números, com no máximo 11 (DDD + celular). */
export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '')
  const national = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits
  return national.slice(0, 11)
}

/** "(16) 99999-1234" enquanto digita. */
export function formatPhoneInput(value: string): string {
  const digits = phoneDigits(value)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  const split = rest.length === 9 ? 5 : 4
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
}

export function isValidPhone(value: string): boolean {
  const digits = phoneDigits(value)
  return digits.length === 10 || digits.length === 11
}

/** Pedido de mesa pronto avisado pelo WebSocket; fica na lista até o garçom marcar que levou. */
export interface ReadyNotice {
  orderId: string
  number: number | null
  tableId: string | null
  tableNumber: number | null
  comandaId: string | null
  readyAt: string
}

export interface OrderStatusChangedPayload {
  orderId: string
  newStatus: string
  number?: number | null
  type?: string
  tableId?: string | null
  comandaId?: string | null
}

export function readStatusChange(payload: unknown): OrderStatusChangedPayload | null {
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as Record<string, unknown>
  if (typeof record['orderId'] !== 'string' || typeof record['newStatus'] !== 'string') return null
  return {
    orderId: record['orderId'],
    newStatus: record['newStatus'],
    number: typeof record['number'] === 'number' ? record['number'] : null,
    ...(typeof record['type'] === 'string' ? { type: record['type'] } : {}),
    tableId: typeof record['tableId'] === 'string' ? record['tableId'] : null,
    comandaId: typeof record['comandaId'] === 'string' ? record['comandaId'] : null,
  }
}

/** Só pedido de mesa interessa ao garçom; entrega e retirada ficam com o balcão. */
export function isTableOrderReady(change: OrderStatusChangedPayload): boolean {
  return change.newStatus === 'ready' && change.type === 'table'
}

export function readyNoticeLabel(notice: Pick<ReadyNotice, 'number' | 'tableNumber'>): string {
  const order = notice.number ? `Pedido #${notice.number}` : 'Pedido'
  return notice.tableNumber ? `Mesa ${notice.tableNumber} · ${order} pronto` : `${order} pronto`
}
