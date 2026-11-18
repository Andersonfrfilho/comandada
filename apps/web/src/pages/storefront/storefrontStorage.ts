import type { AddressFields, CartLine } from './storefrontFormat'
import type { StorefrontOrderType } from './storefrontApi'

// O que fica no aparelho do cliente: carrinho (sobrevive a recarregar a página) e os dados do último
// pedido feito aqui (WhatsApp, nome, endereço, pagamento), para o próximo pedido sair em segundos.

export interface StorefrontProfile {
  phone: string
  name: string
  orderType: StorefrontOrderType | null
  address: AddressFields | null
  paymentMethod: string | null
}

export interface RecentOrder {
  orderId: string
  token: string
  number: number | null
  createdAt: string
}

const cartKey = (establishmentId: string) => `storefront-cart:${establishmentId}`
const profileKey = (establishmentId: string) => `storefront-profile:${establishmentId}`
const recentKey = (establishmentId: string) => `storefront-recent:${establishmentId}`
const lastOrderKey = (establishmentId: string) => `storefront-last-order:${establishmentId}`

/** Itens do último pedido feito neste aparelho, para o "Peça de novo" no topo do cardápio. */
export interface LastOrderItems {
  lines: CartLine[]
  createdAt: string
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sem armazenamento local (aba anônima): o carrinho só não sobrevive a recarregar.
  }
}

export const storefrontStorage = {
  loadCart: (establishmentId: string): CartLine[] => {
    const lines = read<CartLine[]>(cartKey(establishmentId))
    return Array.isArray(lines) ? lines.filter((line) => line && typeof line.productId === 'string') : []
  },
  saveCart: (establishmentId: string, lines: CartLine[]) => write(cartKey(establishmentId), lines.length ? lines : null),
  loadProfile: (establishmentId: string): StorefrontProfile | null => read<StorefrontProfile>(profileKey(establishmentId)),
  saveProfile: (establishmentId: string, profile: StorefrontProfile) => write(profileKey(establishmentId), profile),
  /** Último pedido feito neste aparelho, para "Acompanhar meu pedido" no topo do cardápio. */
  loadRecentOrder: (establishmentId: string): RecentOrder | null => read<RecentOrder>(recentKey(establishmentId)),
  saveRecentOrder: (establishmentId: string, order: RecentOrder) => write(recentKey(establishmentId), order),
  loadLastOrderItems: (establishmentId: string): LastOrderItems | null => {
    const saved = read<LastOrderItems>(lastOrderKey(establishmentId))
    return saved && Array.isArray(saved.lines) && saved.lines.length > 0 ? saved : null
  },
  saveLastOrderItems: (establishmentId: string, lines: CartLine[]) =>
    write(lastOrderKey(establishmentId), lines.length ? { lines, createdAt: new Date().toISOString() } : null),
}
