import { createHmac, timingSafeEqual } from 'crypto'
import type {
  MarketplaceAction,
  MarketplaceEvent,
  MarketplaceEventKind,
  MarketplaceOrder,
  MarketplacePayment,
  MarketplaceProvider,
} from '../../domain/Marketplace'
import { TokenCache, ensureOk, readJsonOrThrow, roundMoney, type FetchFunction } from './marketplaceHttp'

/**
 * iFood Merchant API (developer.ifood.com.br). App centralizado: token por client_credentials e a
 * loja autoriza o app no Portal do Parceiro. Pedidos chegam por polling a cada 30 s (ou webhook) e
 * todo evento recebido precisa de acknowledgment.
 */

export interface IfoodConfig {
  clientId: string
  clientSecret: string
  /** Lojas (merchantId) do restaurante no iFood; vão no header `x-polling-merchants`. */
  merchantIds: string[]
  baseUrl?: string | undefined
}

const DEFAULT_BASE_URL = 'https://merchant-api.ifood.com.br'

// Códigos curtos dos eventos (fullCode entre parênteses).
const EVENT_KINDS: Record<string, MarketplaceEventKind> = {
  PLC: 'placed', // PLACED
  CFM: 'confirmed', // CONFIRMED
  CAN: 'cancelled', // CANCELLED
  CON: 'concluded', // CONCLUDED
  CCR: 'cancellation_requested', // CONSUMER_CANCELLATION_REQUESTED
}

const FULL_CODE_KINDS: Record<string, MarketplaceEventKind> = {
  PLACED: 'placed',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  CONCLUDED: 'concluded',
  CONSUMER_CANCELLATION_REQUESTED: 'cancellation_requested',
}

const PAYMENT_LABELS: Record<string, string> = {
  CREDIT: 'Crédito',
  DEBIT: 'Débito',
  MEAL_VOUCHER: 'Vale-refeição',
  FOOD_VOUCHER: 'Vale-alimentação',
  PIX: 'Pix',
  CASH: 'Dinheiro',
  DIGITAL_WALLET: 'Carteira digital',
  GIFT_CARD: 'Cartão presente',
}

// Ação do painel → caminho no iFood. Sem "entregue": a conclusão é do iFood.
const ACTION_PATHS: Partial<Record<MarketplaceAction, string>> = {
  confirm: 'confirm',
  startPreparation: 'startPreparation',
  readyForPickup: 'readyToPickup',
  dispatch: 'dispatch',
}

// O iFood dá a lista de motivos aceitos para cada pedido (/cancellationReasons). Escolhe o que bate
// com o motivo escrito no painel; sem nenhum parecido, vai o primeiro da lista.
const REASON_KEYWORDS: Array<[RegExp, RegExp]> = [
  [/falt|acab|indispon|estoque/i, /indispon/i],
  [/fechad|hor[aá]rio/i, /fech|hor[aá]rio/i],
  [/entregador|motoboy/i, /motoboy|entregador/i],
  [/endere|[aá]rea|longe/i, /[aá]rea|endere/i],
  [/duplic|repetid/i, /duplic/i],
  [/trote|golp/i, /trote|golp/i],
]

export function pickCancellationCode(
  reasons: Array<{ cancelCodeId: string; description: string }>,
  reason: string
): string | null {
  for (const [reasonPattern, descriptionPattern] of REASON_KEYWORDS) {
    if (!reasonPattern.test(reason)) continue
    const match = reasons.find((candidate) => descriptionPattern.test(candidate.description))
    if (match) return match.cancelCodeId
  }
  return reasons[0]?.cancelCodeId ?? null
}

interface IfoodApiEvent {
  id: string
  code: string
  fullCode?: string
  orderId: string
  merchantId?: string
  createdAt?: string
}

interface IfoodApiOption {
  name: string
  quantity: number
  unitPrice: number
  price?: number
}

interface IfoodApiItem {
  name: string
  externalCode?: string
  quantity: number
  unitPrice: number
  optionsPrice?: number
  totalPrice: number
  observations?: string
  options?: IfoodApiOption[]
}

interface IfoodApiOrder {
  id: string
  displayId: string
  orderType: 'DELIVERY' | 'TAKEOUT' | 'DINE_IN' | 'INDOOR'
  orderTiming?: 'IMMEDIATE' | 'SCHEDULED'
  merchant?: { id: string }
  customer?: { name?: string; phone?: { number?: string; localizer?: string } }
  items?: IfoodApiItem[]
  total?: { subTotal?: number; deliveryFee?: number; benefits?: number; orderAmount?: number; additionalFees?: number }
  payments?: {
    prepaid?: number
    pending?: number
    methods?: Array<{ value: number; method: string; type: 'ONLINE' | 'OFFLINE'; cash?: { changeFor?: number } }>
  }
  delivery?: {
    deliveredBy?: 'IFOOD' | 'MERCHANT'
    pickupCode?: string
    observations?: string
    deliveryAddress?: {
      formattedAddress?: string
      streetName?: string
      streetNumber?: string
      neighborhood?: string
      city?: string
      complement?: string
      reference?: string
    }
  }
  takeout?: { takeoutDateTime?: string }
  schedule?: { deliveryDateTimeStart?: string }
  extraInfo?: string
}

export class IfoodMarketplaceProvider implements MarketplaceProvider {
  readonly platform = 'ifood' as const
  private readonly baseUrl: string
  private readonly tokens: TokenCache

  constructor(
    private readonly config: IfoodConfig,
    private readonly fetchFunction: FetchFunction = fetch
  ) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.tokens = new TokenCache(() => this.requestToken())
  }

  private async requestToken(): Promise<{ accessToken: string; expiresInSeconds: number }> {
    const body = new URLSearchParams({
      grantType: 'client_credentials',
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
    const response = await this.fetchFunction(`${this.baseUrl}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = await readJsonOrThrow<{ accessToken: string; expiresIn: number }>(response, this.platform, 'token')
    return { accessToken: data.accessToken, expiresInSeconds: data.expiresIn }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async (): Promise<Response> =>
      this.fetchFunction(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${await this.tokens.get()}` },
      })
    const response = await send()
    if (response.status !== 401) return response
    this.tokens.invalidate()
    return send()
  }

  async pollEvents(): Promise<MarketplaceEvent[]> {
    const headers: Record<string, string> = {}
    if (this.config.merchantIds.length > 0) headers['x-polling-merchants'] = this.config.merchantIds.join(',')
    const response = await this.request('/events/v1.0/events:polling', { headers })
    if (response.status === 204) return []
    const events = await readJsonOrThrow<IfoodApiEvent[]>(response, this.platform, 'polling')
    return events.map(toEvent)
  }

  async acknowledge(events: MarketplaceEvent[]): Promise<void> {
    if (events.length === 0) return
    const response = await this.request('/events/v1.0/events/acknowledgment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events.map((event) => ({ id: event.id }))),
    })
    await ensureOk(response, this.platform, 'acknowledgment')
  }

  async getOrder(externalId: string): Promise<MarketplaceOrder> {
    const response = await this.request(`/order/v1.0/orders/${encodeURIComponent(externalId)}`)
    return mapIfoodOrder(await readJsonOrThrow<IfoodApiOrder>(response, this.platform, 'pedido'))
  }

  async sendAction(externalId: string, action: MarketplaceAction): Promise<void> {
    const path = ACTION_PATHS[action]
    if (!path) return
    const response = await this.request(`/order/v1.0/orders/${encodeURIComponent(externalId)}/${path}`, { method: 'POST' })
    await ensureOk(response, this.platform, path)
  }

  async requestCancellation(externalId: string, reason: string): Promise<void> {
    const orderPath = `/order/v1.0/orders/${encodeURIComponent(externalId)}`
    const reasonsResponse = await this.request(`${orderPath}/cancellationReasons`)
    const reasons =
      reasonsResponse.status === 204
        ? []
        : await readJsonOrThrow<Array<{ cancelCodeId: string; description: string }>>(reasonsResponse, this.platform, 'cancellationReasons')
    const cancellationCode = pickCancellationCode(reasons, reason)
    if (!cancellationCode) throw new Error('[iFood] pedido sem motivo de cancelamento disponível (prazo pode ter passado)')
    const response = await this.request(`${orderPath}/requestCancellation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.slice(0, 250), cancellationCode }),
    })
    await ensureOk(response, this.platform, 'requestCancellation')
  }

  /** Webhook do iFood: `X-IFood-Signature` = HMAC-SHA256 (hex) do corpo cru com o client secret. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean {
    const received = headers['x-ifood-signature']
    if (!received) return false
    const expected = createHmac('sha256', this.config.clientSecret).update(rawBody).digest('hex')
    const receivedBuffer = Buffer.from(received.trim().toLowerCase())
    const expectedBuffer = Buffer.from(expected)
    return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer)
  }

  parseWebhook(body: unknown): MarketplaceEvent[] {
    const list = Array.isArray(body) ? body : [body]
    return list.filter(isIfoodEvent).map(toEvent)
  }
}

function isIfoodEvent(value: unknown): value is IfoodApiEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate['id'] === 'string' && typeof candidate['code'] === 'string' && typeof candidate['orderId'] === 'string'
}

function toEvent(event: IfoodApiEvent): MarketplaceEvent {
  const kind = EVENT_KINDS[event.code] ?? (event.fullCode ? FULL_CODE_KINDS[event.fullCode] : undefined) ?? 'other'
  return {
    id: event.id,
    code: event.fullCode ?? event.code,
    kind,
    orderId: event.orderId,
    merchantId: event.merchantId,
    createdAt: event.createdAt,
  }
}

export function mapIfoodOrder(order: IfoodApiOrder): MarketplaceOrder {
  const address = order.delivery?.deliveryAddress
  const formattedAddress =
    address?.formattedAddress ??
    [
      [address?.streetName, address?.streetNumber].filter(Boolean).join(', '),
      address?.neighborhood,
      address?.city,
    ]
      .filter(Boolean)
      .join(' - ')

  const payments: MarketplacePayment[] = (order.payments?.methods ?? []).map((method) => ({
    method: PAYMENT_LABELS[method.method] ?? method.method,
    prepaid: method.type === 'ONLINE',
    amount: method.value,
    ...(method.cash?.changeFor ? { changeFor: method.cash.changeFor } : {}),
  }))

  const phone = order.customer?.phone
  const type: MarketplaceOrder['type'] =
    order.orderType === 'DELIVERY' ? 'delivery' : order.orderType === 'TAKEOUT' ? 'pickup' : 'table'

  return {
    platform: 'ifood',
    externalId: order.id,
    displayId: order.displayId,
    merchantId: order.merchant?.id,
    type,
    scheduledFor:
      order.orderTiming === 'SCHEDULED' ? order.schedule?.deliveryDateTimeStart ?? order.takeout?.takeoutDateTime : undefined,
    customerName: order.customer?.name?.trim() || 'Cliente iFood',
    customerPhone: phone?.number ? (phone.localizer ? `${phone.number} (código ${phone.localizer})` : phone.number) : undefined,
    items: (order.items ?? []).map((item) => ({
      name: item.name,
      externalCode: item.externalCode || undefined,
      quantity: item.quantity,
      unitPrice: roundMoney(item.quantity > 0 ? item.totalPrice / item.quantity : item.unitPrice),
      notes: item.observations || undefined,
      options: (item.options ?? []).map((option) => ({
        name: option.name,
        quantity: option.quantity,
        unitPrice: option.unitPrice,
      })),
    })),
    deliveryFee: order.total?.deliveryFee ?? 0,
    discount: order.total?.benefits ?? 0,
    orderAmount: order.total?.orderAmount ?? 0,
    payments,
    deliveryAddress:
      type === 'delivery' && formattedAddress
        ? { formatted: formattedAddress, complement: address?.complement || undefined, reference: address?.reference || undefined }
        : undefined,
    deliveredBy: order.delivery?.deliveredBy === 'MERCHANT' ? 'merchant' : 'platform',
    pickupCode: order.delivery?.pickupCode,
    notes: [order.delivery?.observations, order.extraInfo].filter(Boolean).join(' · ') || undefined,
  }
}
