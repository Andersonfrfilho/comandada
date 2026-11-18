import { api, ApiError } from '@/lib/api'

// Tipos e chamadas das rotas públicas do cardápio online (`/public/storefront`).

export type StorefrontOrderType = 'delivery' | 'retirada'
export type StorefrontPaymentKind = 'cash' | 'card' | 'pix' | 'pix_online' | 'card_link'

export interface StorefrontOption {
  productId: string
  label: string | null
  price: number
}

export interface StorefrontItem {
  key: string
  name: string
  description: string | null
  /** Caminho da foto na API (`/public/products/:id/foto.webp?v=`); null sem foto. */
  image: string | null
  options: StorefrontOption[]
}

export interface StorefrontCategory {
  name: string
  items: StorefrontItem[]
}

export interface StorefrontPaymentMethod {
  name: string
  label: string
  kind: StorefrontPaymentKind
  pixKey: string | null
  pixHolder: string | null
}

export interface StorefrontMenu {
  establishment: {
    id: string
    name: string
    logo: string | null
    primaryColor: string | null
    address: string | null
    city: string | null
    instagram: string | null
    whatsappNumber: string | null
    openingTime: string
    closingTime: string
    workingDays: string[]
    isOpen: boolean
    closedMessage: string | null
    minOrderValue: number
  }
  categories: StorefrontCategory[]
  orderTypes: StorefrontOrderType[]
  paymentMethods: StorefrontPaymentMethod[]
  delivery: { baseFee: number; freeAbove: number | null; maxRadiusKm: number | null; byDistance: boolean } | null
}

export interface DeliveryQuote {
  feeAmount: number
  distanceKm: number | null
  ruleConfigured: boolean
  freeShipping: boolean
  outOfRange: boolean
  maxRadiusKm: number | null
  freeAbove: number | null
}

export interface CustomerLookup {
  known: boolean
  hasSavedAddress: boolean
  lastPaymentMethod: string | null
}

export interface PlaceOrderBody {
  phone: string
  name: string
  orderType: StorefrontOrderType
  items: Array<{ productId: string; quantity: number; notes?: string }>
  address?: string
  complement?: string
  useSavedAddress?: boolean
  paymentMethod: string
  changeFor?: number
  notes?: string
}

export interface OrderPayment {
  status: string
  kind: string
  amount?: number
  expiresAt?: string | null
  pixCopyPaste?: string | null
  paymentUrl?: string | null
}

export interface PlaceOrderResult {
  orderId: string
  number: number | null
  code: string
  trackingToken: string
  estimatedAt: string | null
  payment: OrderPayment | null
}

export interface StorefrontOrderStatus {
  number: number | null
  code: string | null
  status: string
  paymentStatus: string
  type: string
  total: number
  deliveryFee: number
  estimatedAt: string | null
  createdAt: string
  items: Array<{ name: string; quantity: number; unitPrice: number; notes: string | null }>
  payment: { kind: string; status: string; pixCopyPaste: string | null; paymentUrl: string | null; expiresAt: string | null } | null
  pixKey: { key: string; holder: string | null } | null
  establishment: { id: string; name: string; whatsappNumber: string | null }
}

const TOO_MANY_REQUESTS = 429

/** 429 do limite por IP chega em inglês; o cliente precisa de uma frase que diga o que fazer. */
function friendly(error: unknown): never {
  if (error instanceof ApiError && error.status === TOO_MANY_REQUESTS) {
    throw new ApiError('Muitas tentativas seguidas. Espere um minutinho e tente de novo.', error.status, error.code)
  }
  throw error
}

export const storefrontApi = {
  menu(establishmentId: string | undefined): Promise<StorefrontMenu> {
    const query = establishmentId
      ? `establishmentId=${encodeURIComponent(establishmentId)}`
      : `host=${encodeURIComponent(window.location.hostname)}`
    return api.get<StorefrontMenu>(`/public/storefront?${query}`).catch(friendly)
  },
  quote(
    establishmentId: string,
    body: { address?: string; phone?: string; useSavedAddress?: boolean; itemsTotal: number }
  ): Promise<DeliveryQuote> {
    return api.post<DeliveryQuote>(`/public/storefront/${establishmentId}/delivery-quote`, body).catch(friendly)
  },
  lookupCustomer(establishmentId: string, phone: string): Promise<CustomerLookup> {
    return api.post<CustomerLookup>(`/public/storefront/${establishmentId}/customer`, { phone }).catch(friendly)
  },
  placeOrder(establishmentId: string, body: PlaceOrderBody): Promise<PlaceOrderResult> {
    return api.post<PlaceOrderResult>(`/public/storefront/${establishmentId}/orders`, body).catch(friendly)
  },
  orderStatus(orderId: string, token: string): Promise<StorefrontOrderStatus> {
    return api.get<StorefrontOrderStatus>(`/public/storefront/orders/${orderId}?token=${encodeURIComponent(token)}`).catch(friendly)
  },
}
