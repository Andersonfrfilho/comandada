import { createHmac, timingSafeEqual } from 'crypto'
import type {
  MarketplaceAction,
  MarketplaceCancellationReason,
  MarketplaceEvent,
  MarketplaceEventKind,
  MarketplaceOrder,
  MarketplacePlatform,
  MarketplaceProvider,
} from '../../domain/Marketplace'
import { TokenCache, ensureOk, moneyValue, readJsonOrThrow, roundMoney, type FetchFunction } from './marketplaceHttp'

/**
 * Padrão Open Delivery (Abrasel), que a 99Food adotou. Qualquer plataforma no padrão usa este conector:
 * muda só o endereço da API e as credenciais. Token OAuth2 (client_credentials), eventos por polling em
 * `/v1/events:polling` com acknowledgment, pedido em `/v1/orders/{id}` e as ações do pedido.
 */

export interface OpenDeliveryConfig {
  platform: MarketplacePlatform
  baseUrl: string
  /** Endereço do token quando a plataforma o põe fora da API (padrão: `<baseUrl>/oauth/token`). */
  tokenUrl?: string | undefined
  clientId: string
  clientSecret: string
  merchantIds: string[]
}

const EVENT_KINDS: Record<string, MarketplaceEventKind> = {
  CREATED: 'placed',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  CANCELLATION_REQUESTED: 'cancellation_requested',
  CONCLUDED: 'concluded',
  DELIVERED: 'concluded',
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
  OTHER: 'Outro',
}

const ACTION_PATHS: Partial<Record<MarketplaceAction, string>> = {
  confirm: 'confirm',
  startPreparation: 'preparing',
  readyForPickup: 'readyForPickup',
  dispatch: 'dispatch',
  delivered: 'delivered',
}

// Códigos de cancelamento do padrão; o motivo escrito no painel escolhe o mais próximo.
const CANCELLATION_CODES: Array<[RegExp, string]> = [
  [/falt|acab|indispon|estoque/i, 'UNAVAILABLE_ITEM'],
  [/fechad|hor[aá]rio/i, 'OUTSIDE_DELIVERY_HOURS'],
  [/entregador|motoboy/i, 'RESTAURANT_WITHOUT_DELIVERY_MAN'],
  [/endere|[aá]rea|longe/i, 'ORDER_OUTSIDE_THE_DELIVERY_AREA'],
  [/duplic|repetid/i, 'DUPLICATE_APPLICATION'],
  [/card[aá]pio|pre[cç]o/i, 'OUTDATED_MENU'],
]
const DEFAULT_CANCELLATION_CODE = 'INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT'

const CANCELLATION_REASONS: MarketplaceCancellationReason[] = [
  { code: 'UNAVAILABLE_ITEM', description: 'Item indisponível' },
  { code: 'OUTSIDE_DELIVERY_HOURS', description: 'Fora do horário de atendimento' },
  { code: 'RESTAURANT_WITHOUT_DELIVERY_MAN', description: 'Sem entregador' },
  { code: 'ORDER_OUTSIDE_THE_DELIVERY_AREA', description: 'Fora da área de entrega' },
  { code: 'DUPLICATE_APPLICATION', description: 'Pedido em duplicidade' },
  { code: 'OUTDATED_MENU', description: 'Cardápio desatualizado' },
  { code: 'SYSTEMIC_ISSUES', description: 'Problemas de sistema' },
  { code: 'INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT', description: 'Dificuldades internas do restaurante' },
]

export function openDeliveryCancellationCode(reason: string): string {
  return CANCELLATION_CODES.find(([pattern]) => pattern.test(reason))?.[1] ?? DEFAULT_CANCELLATION_CODE
}

interface OpenDeliveryApiEvent {
  eventId: string
  eventType: string
  orderId: string
  createdAt?: string
  sourceAppId?: string
  merchantId?: string
}

type Money = number | { value: number; currency?: string }

interface OpenDeliveryApiItem {
  name: string
  externalCode?: string
  quantity: number
  unitPrice?: Money
  totalPrice?: Money
  specialInstructions?: string
  options?: Array<{ name: string; quantity: number; unitPrice?: Money }>
}

interface OpenDeliveryApiOrder {
  id: string
  displayId?: string
  type: 'DELIVERY' | 'TAKEOUT' | 'INDOOR'
  orderTiming?: 'INSTANT' | 'SCHEDULED' | 'ONDEMAND'
  merchant?: { id?: string }
  customer?: { name?: string; phone?: { number?: string; extension?: string } }
  items?: OpenDeliveryApiItem[]
  otherFees?: Array<{ type?: string; price?: Money }>
  total?: { itemsPrice?: Money; otherFees?: Money; discount?: Money; orderAmount?: Money }
  payments?: {
    methods?: Array<{ value?: number; type?: 'PREPAID' | 'PENDING'; method?: string; changeFor?: number }>
  }
  delivery?: {
    deliveredBy?: 'MARKETPLACE' | 'MERCHANT'
    pickupCode?: string
    deliveryAddress?: {
      formattedAddress?: string
      street?: string
      number?: string
      district?: string
      city?: string
      complement?: string
      reference?: string
    }
  }
  schedule?: { scheduledDateTimeStart?: string }
  extraInfo?: string
}

export class OpenDeliveryMarketplaceProvider implements MarketplaceProvider {
  readonly platform: MarketplacePlatform
  private readonly baseUrl: string
  private readonly tokens: TokenCache

  constructor(
    private readonly config: OpenDeliveryConfig,
    private readonly fetchFunction: FetchFunction = fetch
  ) {
    this.platform = config.platform
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.tokens = new TokenCache(() => this.requestToken())
  }

  private async requestToken(): Promise<{ accessToken: string; expiresInSeconds: number }> {
    const response = await this.fetchFunction(this.config.tokenUrl ?? `${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    })
    const data = await readJsonOrThrow<{ access_token: string; expires_in?: number }>(response, this.platform, 'token')
    return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? 3600 }
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

  private postJson(path: string, body: unknown): Promise<Response> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async pollEvents(): Promise<MarketplaceEvent[]> {
    const headers: Record<string, string> = {}
    if (this.config.merchantIds.length > 0) headers['x-polling-merchants'] = this.config.merchantIds.join(',')
    const response = await this.request('/v1/events:polling', { headers })
    if (response.status === 204) return []
    const events = await readJsonOrThrow<OpenDeliveryApiEvent[]>(response, this.platform, 'polling')
    return events.map(toEvent)
  }

  async acknowledge(events: MarketplaceEvent[]): Promise<void> {
    if (events.length === 0) return
    const response = await this.postJson(
      '/v1/events/acknowledgment',
      events.map((event) => ({ id: event.id, orderId: event.orderId, eventType: event.code }))
    )
    await ensureOk(response, this.platform, 'acknowledgment')
  }

  async getOrder(externalId: string): Promise<MarketplaceOrder> {
    const response = await this.request(`/v1/orders/${encodeURIComponent(externalId)}`)
    return mapOpenDeliveryOrder(this.platform, await readJsonOrThrow<OpenDeliveryApiOrder>(response, this.platform, 'pedido'))
  }

  async sendAction(externalId: string, action: MarketplaceAction): Promise<void> {
    const path = ACTION_PATHS[action]
    if (!path) return
    const body = action === 'confirm' ? { createdAt: new Date().toISOString() } : {}
    const response = await this.postJson(`/v1/orders/${encodeURIComponent(externalId)}/${path}`, body)
    await ensureOk(response, this.platform, path)
  }

  async cancellationReasons(): Promise<MarketplaceCancellationReason[]> {
    return CANCELLATION_REASONS
  }

  async requestCancellation(externalId: string, cancellation: { code?: string | undefined; reason: string }): Promise<void> {
    const response = await this.postJson(`/v1/orders/${encodeURIComponent(externalId)}/requestCancellation`, {
      reason: cancellation.reason.slice(0, 250),
      code: cancellation.code ?? openDeliveryCancellationCode(cancellation.reason),
      mode: 'MANUAL',
    })
    await ensureOk(response, this.platform, 'requestCancellation')
  }

  /** O padrão não tem negociação com contraproposta; pedidos de cancelamento do cliente ficam no log. */
  parseDispute(): null {
    return null
  }

  parseDisputeSettlement(): null {
    return null
  }

  async respondDispute(): Promise<void> {
    throw new Error('Negociação não disponível nesta plataforma')
  }

  /**
   * Webhook (`POST /v1/newEvent` no padrão): `X-App-Signature` = HMAC-SHA256 do corpo com o client secret.
   * Aceita hex ou base64, porque as plataformas do padrão variam na codificação.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean {
    const received = headers['x-app-signature']?.trim()
    if (!received) return false
    const digest = createHmac('sha256', this.config.clientSecret).update(rawBody).digest()
    return [digest.toString('hex'), digest.toString('base64')].some((expected) => {
      const expectedBuffer = Buffer.from(expected)
      const receivedBuffer = Buffer.from(expected.length === 64 ? received.toLowerCase() : received)
      return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer)
    })
  }

  parseWebhook(_rawBody: Buffer, body: unknown): MarketplaceEvent[] {
    const list = Array.isArray(body) ? body : [body]
    return list.filter(isOpenDeliveryEvent).map(toEvent)
  }
}

function isOpenDeliveryEvent(value: unknown): value is OpenDeliveryApiEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate['eventId'] === 'string' && typeof candidate['eventType'] === 'string' && typeof candidate['orderId'] === 'string'
}

function toEvent(event: OpenDeliveryApiEvent): MarketplaceEvent {
  return {
    id: event.eventId,
    code: event.eventType,
    kind: EVENT_KINDS[event.eventType] ?? 'other',
    orderId: event.orderId,
    merchantId: event.merchantId,
    createdAt: event.createdAt,
  }
}

export function mapOpenDeliveryOrder(platform: MarketplacePlatform, order: OpenDeliveryApiOrder): MarketplaceOrder {
  const address = order.delivery?.deliveryAddress
  const formattedAddress =
    address?.formattedAddress ??
    [[address?.street, address?.number].filter(Boolean).join(', '), address?.district, address?.city].filter(Boolean).join(' - ')

  const deliveryFee = roundMoney(
    (order.otherFees ?? [])
      .filter((fee) => !fee.type || fee.type === 'DELIVERY_FEE')
      .reduce((sum, fee) => sum + moneyValue(fee.price), 0)
  )

  const type: MarketplaceOrder['type'] =
    order.type === 'DELIVERY' ? 'delivery' : order.type === 'TAKEOUT' ? 'pickup' : 'table'

  return {
    platform,
    externalId: order.id,
    displayId: order.displayId ?? order.id.slice(-6),
    merchantId: order.merchant?.id,
    type,
    scheduledFor: order.orderTiming === 'SCHEDULED' ? order.schedule?.scheduledDateTimeStart : undefined,
    customerName: order.customer?.name?.trim() || 'Cliente 99Food',
    customerPhone: order.customer?.phone?.number
      ? [order.customer.phone.number, order.customer.phone.extension].filter(Boolean).join(' ramal ')
      : undefined,
    items: (order.items ?? []).map((item) => {
      const total = moneyValue(item.totalPrice)
      return {
        name: item.name,
        externalCode: item.externalCode || undefined,
        quantity: item.quantity,
        unitPrice: roundMoney(total > 0 && item.quantity > 0 ? total / item.quantity : moneyValue(item.unitPrice)),
        notes: item.specialInstructions || undefined,
        options: (item.options ?? []).map((option) => ({
          name: option.name,
          quantity: option.quantity,
          unitPrice: moneyValue(option.unitPrice),
        })),
      }
    }),
    deliveryFee,
    discount: moneyValue(order.total?.discount),
    orderAmount: moneyValue(order.total?.orderAmount),
    payments: (order.payments?.methods ?? []).map((method) => ({
      method: PAYMENT_LABELS[method.method ?? 'OTHER'] ?? method.method ?? 'Outro',
      prepaid: method.type !== 'PENDING',
      amount: method.value ?? 0,
      ...(method.changeFor ? { changeFor: method.changeFor } : {}),
    })),
    deliveryAddress:
      type === 'delivery' && formattedAddress
        ? { formatted: formattedAddress, complement: address?.complement || undefined, reference: address?.reference || undefined }
        : undefined,
    deliveredBy: order.delivery?.deliveredBy === 'MERCHANT' ? 'merchant' : 'platform',
    pickupCode: order.delivery?.pickupCode,
    notes: order.extraInfo || undefined,
  }
}
