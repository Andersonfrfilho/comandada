import { createHmac, timingSafeEqual } from 'crypto'
import type {
  MarketplaceAction,
  MarketplaceBenefit,
  MarketplaceCancellationReason,
  MarketplaceDateRange,
  MarketplaceDispute,
  MarketplaceDisputeAlternative,
  MarketplaceDisputeKind,
  MarketplaceDisputeResponse,
  MarketplaceDisputeSettlement,
  MarketplaceEvent,
  MarketplaceEventKind,
  MarketplaceFinancialProvider,
  MarketplaceOrder,
  MarketplacePayment,
  MarketplaceProvider,
  MarketplaceReview,
  MarketplaceReviewPage,
  MarketplaceReviewProvider,
  MarketplaceReviewSummary,
  MarketplaceSale,
  MarketplaceSettlement,
} from '../../domain/Marketplace'
import { TokenCache, ensureOk, readJsonOrThrow, roundMoney, withRetry, type FetchFunction } from './marketplaceHttp'

/**
 * iFood Merchant API (developer.ifood.com.br). App centralizado: token por client_credentials e a
 * loja autoriza o app no Portal do Parceiro. Pedidos chegam por polling a cada 30 s (ou webhook) e
 * todo evento recebido precisa de acknowledgment. Regras e prazos em docs/integracoes/ifood.md.
 */

export interface IfoodConfig {
  clientId: string
  clientSecret: string
  /** Lojas (merchantId) do restaurante no iFood; vão no header `x-polling-merchants`. */
  merchantIds: string[]
  baseUrl?: string | undefined
}

const DEFAULT_BASE_URL = 'https://merchant-api.ifood.com.br'
/** O iFood aceita até 100 lojas por consulta de polling. */
const MAX_POLLING_MERCHANTS = 100

// Códigos curtos dos eventos (fullCode no comentário).
const EVENT_KINDS: Record<string, MarketplaceEventKind> = {
  PLC: 'placed', // PLACED
  CFM: 'confirmed', // CONFIRMED
  CAN: 'cancelled', // CANCELLED
  CON: 'concluded', // CONCLUDED
  CAR: 'cancellation_requested', // CANCELLATION_REQUESTED
  CCR: 'cancellation_requested', // CONSUMER_CANCELLATION_REQUESTED (legado)
  CARF: 'cancellation_failed', // CANCELLATION_REQUEST_FAILED
  HSD: 'dispute_opened', // HANDSHAKE_DISPUTE
  HSS: 'dispute_settled', // HANDSHAKE_SETTLEMENT
  OPA: 'order_patched', // ORDER_PATCHED
  DAR: 'address_changed', // DELIVERY_ADDRESS_CHANGE_REQUESTED
}

const FULL_CODE_KINDS: Record<string, MarketplaceEventKind> = {
  PLACED: 'placed',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  CONCLUDED: 'concluded',
  CANCELLATION_REQUESTED: 'cancellation_requested',
  CONSUMER_CANCELLATION_REQUESTED: 'cancellation_requested',
  CANCELLATION_REQUEST_FAILED: 'cancellation_failed',
  HANDSHAKE_DISPUTE: 'dispute_opened',
  HANDSHAKE_SETTLEMENT: 'dispute_settled',
  ORDER_PATCHED: 'order_patched',
  DELIVERY_ADDRESS_CHANGE_REQUESTED: 'address_changed',
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

const SPONSOR_LABELS: Record<string, string> = {
  IFOOD: 'iFood',
  MERCHANT: 'loja',
  EXTERNAL: 'parceiro',
  CHAIN: 'rede',
  INDUSTRY: 'indústria',
}

const LIABILITY_LABELS: Record<string, string> = {
  IFOOD: 'iFood',
  MERCHANT: 'loja',
  INTERNAL: 'iFood',
  EXTERNAL: 'externo',
}

// Ação do painel → caminho no iFood. Sem "entregue"/"retirou": a conclusão é do iFood.
const ACTION_PATHS: Partial<Record<MarketplaceAction, string>> = {
  confirm: 'confirm',
  startPreparation: 'startPreparation',
  readyForPickup: 'readyToPickup',
  dispatch: 'dispatch',
}

// Usado só quando o painel cancela pelo status (sem escolher o motivo do iFood): escolhe o motivo da
// lista que combina com o texto; sem nenhum parecido, vai o primeiro da lista.
const REASON_KEYWORDS: Array<[RegExp, RegExp]> = [
  [/falt|acab|indispon|estoque/i, /indispon/i],
  [/fechad|hor[aá]rio/i, /fech|hor[aá]rio/i],
  [/entregador|motoboy/i, /motoboy|entregador/i],
  [/endere|[aá]rea|longe/i, /[aá]rea|endere/i],
  [/duplic|repetid/i, /duplic/i],
  [/trote|golp/i, /trote|golp/i],
  [/card[aá]pio|pre[cç]o/i, /card[aá]pio/i],
  [/sistema/i, /sistema/i],
]

export function pickCancellationCode(reasons: MarketplaceCancellationReason[], reason: string): string | null {
  for (const [reasonPattern, descriptionPattern] of REASON_KEYWORDS) {
    if (!reasonPattern.test(reason)) continue
    const match = reasons.find((candidate) => descriptionPattern.test(candidate.description))
    if (match) return match.code
  }
  return reasons[0]?.code ?? null
}

const DISPUTE_KINDS: Record<string, MarketplaceDisputeKind> = {
  DELAY: 'delay',
  PREPARATION_TIME: 'cancellation',
  // Depois de entregue o cliente quer o dinheiro de volta.
  AFTER_DELIVERY: 'refund',
  AFTER_DELIVERY_PARTIALLY: 'partial_cancellation',
}

interface IfoodApiEvent {
  id: string
  code: string
  fullCode?: string
  orderId: string
  merchantId?: string
  createdAt?: string
  metadata?: Record<string, unknown>
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

export interface IfoodApiOrder {
  id: string
  displayId: string
  orderType: 'DELIVERY' | 'TAKEOUT' | 'DINE_IN' | 'INDOOR'
  orderTiming?: 'IMMEDIATE' | 'SCHEDULED'
  merchant?: { id: string }
  customer?: { name?: string; documentNumber?: string; phone?: { number?: string; localizer?: string } }
  items?: IfoodApiItem[]
  benefits?: Array<{
    value?: number
    target?: string
    sponsorshipValues?: Array<{ name?: string; value?: number; description?: string }>
    campaign?: { name?: string }
  }>
  total?: { subTotal?: number; deliveryFee?: number; benefits?: number; orderAmount?: number; additionalFees?: number }
  payments?: {
    prepaid?: number
    pending?: number
    methods?: Array<{
      value: number
      method: string
      type: 'ONLINE' | 'OFFLINE'
      prepaid?: boolean
      card?: { brand?: string }
      cash?: { changeFor?: number }
    }>
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
  indoor?: { mode?: string; table?: string; deliveryDateTime?: string }
  takeout?: { takeoutDateTime?: string }
  schedule?: { deliveryDateTimeStart?: string }
  extraInfo?: string
}

export class IfoodMarketplaceProvider implements MarketplaceProvider {
  readonly platform = 'ifood' as const
  readonly financial: MarketplaceFinancialProvider
  readonly reviews: MarketplaceReviewProvider
  private readonly baseUrl: string
  private readonly tokens: TokenCache

  constructor(
    private readonly config: IfoodConfig,
    private readonly fetchFunction: FetchFunction = fetch
  ) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    // Critério de homologação: renovar o token só quando vencer.
    this.tokens = new TokenCache(() => this.requestToken(), 0)
    this.financial = new IfoodFinancial(this)
    this.reviews = new IfoodReviews(this)
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

  /** Chamada autenticada: 401 renova o token uma vez; 429/5xx esperam e tentam de novo. */
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async (): Promise<Response> =>
      withRetry(async () =>
        this.fetchFunction(`${this.baseUrl}${path}`, {
          ...init,
          headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${await this.tokens.get()}` },
        })
      )
    const response = await send()
    if (response.status !== 401) return response
    this.tokens.invalidate()
    return send()
  }

  async pollEvents(): Promise<MarketplaceEvent[]> {
    const merchantGroups: string[][] = []
    for (let index = 0; index < this.config.merchantIds.length; index += MAX_POLLING_MERCHANTS) {
      merchantGroups.push(this.config.merchantIds.slice(index, index + MAX_POLLING_MERCHANTS))
    }
    if (merchantGroups.length === 0) merchantGroups.push([])
    const events: MarketplaceEvent[] = []
    for (const merchants of merchantGroups) {
      const headers: Record<string, string> = {}
      if (merchants.length > 0) headers['x-polling-merchants'] = merchants.join(',')
      const response = await this.request('/events/v1.0/events:polling', { headers })
      if (response.status === 204) continue
      const received = await readJsonOrThrow<IfoodApiEvent[]>(response, this.platform, 'polling')
      events.push(...received.map(toEvent))
    }
    return events
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

  async cancellationReasons(externalId: string): Promise<MarketplaceCancellationReason[]> {
    const response = await this.request(`/order/v1.0/orders/${encodeURIComponent(externalId)}/cancellationReasons`)
    // 204: o pedido não pode mais ser cancelado pelo restaurante.
    if (response.status === 204) return []
    const data = await readJsonOrThrow<unknown>(response, this.platform, 'cancellationReasons')
    // A referência devolve uma lista de { cancelCodeId, description }; o guia mostra { reasons: [{ code, description }] }.
    const list = Array.isArray(data) ? data : ((data as { reasons?: unknown[] } | null)?.reasons ?? [])
    return list
      .map((entry) => {
        const reason = entry as { cancelCodeId?: unknown; code?: unknown; description?: unknown }
        return { code: String(reason.cancelCodeId ?? reason.code ?? ''), description: String(reason.description ?? '') }
      })
      .filter((reason) => reason.code)
  }

  async requestCancellation(externalId: string, cancellation: { code?: string | undefined; reason: string }): Promise<void> {
    let code = cancellation.code
    if (!code) {
      const reasons = await this.cancellationReasons(externalId)
      code = pickCancellationCode(reasons, cancellation.reason) ?? undefined
    }
    if (!code) throw new Error('[iFood] o pedido não pode mais ser cancelado pelo restaurante (sem motivos disponíveis)')
    const response = await this.request(`/order/v1.0/orders/${encodeURIComponent(externalId)}/requestCancellation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancellation.reason.slice(0, 250), cancellationCode: code }),
    })
    await ensureOk(response, this.platform, 'requestCancellation')
  }

  parseDispute(event: MarketplaceEvent): MarketplaceDispute | null {
    const metadata = event.metadata ?? {}
    const disputeId = stringField(metadata, 'disputeId')
    if (!disputeId) return null
    const inner = (metadata['metadata'] as Record<string, unknown> | undefined) ?? {}
    const action = stringField(metadata, 'action')
    const handshakeType = stringField(metadata, 'handshakeType') ?? ''
    const kind: MarketplaceDisputeKind =
      action === 'PARTIAL_CANCELLATION' ? 'partial_cancellation' : (DISPUTE_KINDS[handshakeType] ?? 'cancellation')
    const alternatives = Array.isArray(metadata['alternatives']) ? (metadata['alternatives'] as Array<Record<string, unknown>>) : []
    const garnish = Array.isArray(inner['garnishItems']) ? (inner['garnishItems'] as Array<Record<string, unknown>>) : []
    const evidences = Array.isArray(metadata['evidences']) ? (metadata['evidences'] as Array<Record<string, unknown>>) : []
    const acceptReasons = Array.isArray(inner['acceptCancellationReasons']) ? (inner['acceptCancellationReasons'] as string[]) : undefined
    return {
      externalId: disputeId,
      orderExternalId: event.orderId,
      kind,
      message: stringField(metadata, 'message'),
      expiresAt: stringField(metadata, 'expiresAt'),
      timeoutAction: stringField(metadata, 'timeoutAction'),
      reasons: acceptReasons,
      alternatives: alternatives.map(toDisputeAlternative),
      items: garnish.map((item) => ({
        name: stringField(item, 'name'),
        quantity: typeof item['quantity'] === 'number' ? item['quantity'] : undefined,
        amount: centsAmount(item['amount']),
        reason: stringField(item, 'reason'),
      })),
      evidenceUrls: evidences.map((evidence) => stringField(evidence, 'url')).filter((url): url is string => Boolean(url)),
    }
  }

  parseDisputeSettlement(event: MarketplaceEvent): MarketplaceDisputeSettlement | null {
    const metadata = event.metadata ?? {}
    const disputeId = stringField(metadata, 'disputeId')
    if (!disputeId) return null
    return { disputeExternalId: disputeId, status: (stringField(metadata, 'status') ?? 'settled').toLowerCase() }
  }

  async respondDispute(dispute: MarketplaceDispute, answer: MarketplaceDisputeResponse): Promise<void> {
    const base = `/order/v1.0/disputes/${encodeURIComponent(dispute.externalId)}`
    let path = `${base}/accept`
    let body: unknown = answer.reason ? { reason: answer.reason } : undefined
    if (answer.decision === 'reject') {
      path = `${base}/reject`
      body = { reason: answer.reason }
    } else if (answer.decision === 'alternative') {
      const alternative = dispute.alternatives.find((candidate) => candidate.id === answer.alternativeId)
      if (!alternative) throw new Error('Alternativa não encontrada nesta negociação')
      path = `${base}/alternatives/${encodeURIComponent(alternative.id)}`
      body =
        alternative.type === 'additional_time'
          ? {
              type: 'ADDITIONAL_TIME',
              metadata: { additionalTimeInMinutes: answer.minutes, additionalTimeReason: answer.reason ?? alternative.reasons?.[0] },
            }
          : {
              type: 'REFUND',
              // O iFood fala em centavos, como texto.
              metadata: { amount: { currency: 'BRL', value: String(Math.round((answer.amount ?? 0) * 100)) } },
            }
    }
    const response = await this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    await ensureOk(response, this.platform, `disputa ${answer.decision}`)
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

  parseWebhook(_rawBody: Buffer, body: unknown): MarketplaceEvent[] {
    const list = Array.isArray(body) ? body : [body]
    return list.filter(isIfoodEvent).map(toEvent)
  }
}

// ---------------------------------------------------------------- financeiro (Financial API v3)

interface IfoodSale {
  id: string
  shortId?: string
  createdAt: string
  currentStatus?: string
  saleGrossValue?: { bag?: string | number; deliveryFee?: string | number; serviceFee?: string | number }
  payments?: { methods?: Array<{ method?: string; type?: string; card?: { brand?: string }; liability?: string }> }
  billingSummary?: { saleBalance?: string | number; billingEntries?: Array<{ name?: string; value?: string | number }> }
  orderEvents?: unknown
}

interface IfoodSettlements {
  settlements?: Array<{
    startDateCalculation?: string
    endDateCalculation?: string
    closingItems?: Array<{ id?: string; type?: string; product?: string; amount?: number; status?: string; paymentDate?: string }>
  }>
}

const BILLING_LABELS: Record<string, string> = {
  COMMISSION: 'Comissão',
  PAYMENT_FEE: 'Taxa de pagamento',
  ACQUIRER_FEE: 'Taxa de pagamento',
  DELIVERY_COMMISSION: 'Comissão da entrega',
  DELIVERY_FEE: 'Taxa de entrega',
  BENEFIT_MERCHANT: 'Desconto pago pela loja',
  BENEFIT_IFOOD: 'Desconto pago pelo iFood',
  ANTICIPATION_FEE: 'Taxa de antecipação',
  SMALL_ORDER_FEE: 'Taxa de pedido mínimo',
  SERVICE_FEE: 'Taxa de serviço',
}

class IfoodFinancial implements MarketplaceFinancialProvider {
  /** Eventos financeiros aceitam até 33 dias; vendas e repasses seguem o mesmo limite aqui. */
  readonly maxRangeDays = 31

  constructor(private readonly api: IfoodMarketplaceProvider) {}

  async listSales(merchantId: string, range: MarketplaceDateRange): Promise<MarketplaceSale[]> {
    const sales: MarketplaceSale[] = []
    for (let page = 1; page <= 50; page += 1) {
      const query = new URLSearchParams({ beginSalesDate: range.from, endSalesDate: range.to, page: String(page) })
      const response = await this.api.request(`/financial/v3.0/merchants/${encodeURIComponent(merchantId)}/sales?${query}`)
      if (response.status === 204) break
      const data = await readJsonOrThrow<{ sales?: IfoodSale[]; pageCount?: number }>(response, 'ifood', 'vendas')
      sales.push(...(data.sales ?? []).map((sale) => mapIfoodSale(merchantId, sale)))
      if (!data.pageCount || page >= data.pageCount) break
    }
    return sales
  }

  async listSettlements(merchantId: string, range: MarketplaceDateRange): Promise<MarketplaceSettlement[]> {
    const query = new URLSearchParams({ beginPaymentDate: range.from, endPaymentDate: range.to })
    const response = await this.api.request(`/financial/v3.0/merchants/${encodeURIComponent(merchantId)}/settlements?${query}`)
    if (response.status === 204) return []
    const data = await readJsonOrThrow<IfoodSettlements>(response, 'ifood', 'repasses')
    return (data.settlements ?? []).flatMap((settlement) =>
      (settlement.closingItems ?? []).map((item, index) => ({
        platform: 'ifood' as const,
        merchantId,
        id: item.id ?? `${settlement.startDateCalculation}-${index}`,
        periodStart: settlement.startDateCalculation,
        periodEnd: settlement.endDateCalculation,
        paymentDate: item.paymentDate,
        amount: roundMoney(item.amount ?? 0),
        status: item.status ?? '',
        type: item.type,
      }))
    )
  }
}

export function mapIfoodSale(merchantId: string, sale: IfoodSale): MarketplaceSale {
  const gross = numeric(sale.saleGrossValue?.bag) + numeric(sale.saleGrossValue?.deliveryFee) + numeric(sale.saleGrossValue?.serviceFee)
  const payment = sale.payments?.methods?.[0]
  return {
    platform: 'ifood',
    merchantId,
    externalOrderId: sale.id,
    displayId: sale.shortId,
    date: sale.createdAt,
    status: sale.currentStatus ?? '',
    paymentMethod: payment ? [PAYMENT_LABELS[payment.method ?? ''] ?? payment.method, payment.card?.brand].filter(Boolean).join(' ') : undefined,
    paymentLiability: payment?.liability ? (LIABILITY_LABELS[payment.liability] ?? payment.liability) : undefined,
    grossAmount: roundMoney(gross),
    entries: (sale.billingSummary?.billingEntries ?? []).map((entry) => ({
      label: BILLING_LABELS[entry.name ?? ''] ?? humanize(entry.name ?? 'Outro'),
      amount: roundMoney(numeric(entry.value)),
    })),
    netAmount: roundMoney(numeric(sale.billingSummary?.saleBalance)),
  }
}

// ---------------------------------------------------------------- avaliações (Review API v2)

interface IfoodReview {
  id: string
  score: number
  status?: string
  comment?: string
  customerName?: string
  createdAt: string
  replies?: Array<{ text: string; from: string; createdAt?: string }>
  order?: { id: string; shortId?: string; createdAt?: string }
}

class IfoodReviews implements MarketplaceReviewProvider {
  readonly policyUrl = 'https://portal.ifood.com.br/evaluation-policies'

  constructor(private readonly api: IfoodMarketplaceProvider) {}

  async list(
    merchantId: string,
    options: { page: number; pageSize: number; dateFrom?: string | undefined; dateTo?: string | undefined }
  ): Promise<MarketplaceReviewPage> {
    const query = new URLSearchParams({
      page: String(options.page),
      pageSize: String(Math.min(options.pageSize, 50)),
      addCount: 'true',
    })
    if (options.dateFrom) query.set('dateFrom', options.dateFrom)
    if (options.dateTo) query.set('dateTo', options.dateTo)
    const response = await this.api.request(`/review/v2.0/merchants/${encodeURIComponent(merchantId)}/reviews?${query}`)
    const data = await readJsonOrThrow<{ reviews?: IfoodReview[]; page?: number; pageCount?: number; total?: number }>(response, 'ifood', 'avaliações')
    return {
      reviews: (data.reviews ?? []).map(mapIfoodReview),
      page: data.page ?? options.page,
      pageCount: data.pageCount ?? 1,
      total: data.total ?? data.reviews?.length ?? 0,
    }
  }

  async answer(merchantId: string, reviewId: string, text: string): Promise<void> {
    const response = await this.api.request(
      `/review/v2.0/merchants/${encodeURIComponent(merchantId)}/reviews/${encodeURIComponent(reviewId)}/answers`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }
    )
    await ensureOk(response, 'ifood', 'responder avaliação')
  }

  async summary(merchantId: string): Promise<MarketplaceReviewSummary> {
    const response = await this.api.request(`/review/v2.0/merchants/${encodeURIComponent(merchantId)}/summary`)
    const data = await readJsonOrThrow<Partial<MarketplaceReviewSummary>>(response, 'ifood', 'resumo das avaliações')
    return { score: data.score ?? 0, totalReviewsCount: data.totalReviewsCount ?? 0, validReviewsCount: data.validReviewsCount ?? 0 }
  }
}

export function mapIfoodReview(review: IfoodReview): MarketplaceReview {
  const status = review.status ?? 'UNKNOWN'
  return {
    id: review.id,
    score: review.score,
    comment: review.comment || undefined,
    customerName: review.customerName || undefined,
    createdAt: review.createdAt,
    status,
    canReply: status === 'NOT_REPLIED',
    replies: (review.replies ?? []).map((reply) => ({ text: reply.text, from: reply.from, createdAt: reply.createdAt })),
    order: review.order ? { id: review.order.id, displayId: review.order.shortId, createdAt: review.order.createdAt } : undefined,
  }
}

// ---------------------------------------------------------------- tradução

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
    metadata: event.metadata,
  }
}

function toDisputeAlternative(alternative: Record<string, unknown>): MarketplaceDisputeAlternative {
  const type = stringField(alternative, 'type')
  const metadata = (alternative['metadata'] as Record<string, unknown> | undefined) ?? {}
  return {
    id: stringField(alternative, 'id') ?? '',
    type: type === 'REFUND' ? 'refund' : type === 'ADDITIONAL_TIME' ? 'additional_time' : 'other',
    maxAmount: centsAmount(metadata['maxAmount']),
    minutes: Array.isArray(metadata['allowedsAdditionalTimeInMinutes']) ? (metadata['allowedsAdditionalTimeInMinutes'] as number[]) : undefined,
    reasons: Array.isArray(metadata['allowedsAdditionalTimeReasons']) ? (metadata['allowedsAdditionalTimeReasons'] as string[]) : undefined,
  }
}

function stringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value ? value : undefined
}

/** Valor de negociação do iFood: `{ value: "2080", currency }` em centavos. */
function centsAmount(input: unknown): number | undefined {
  if (!input || typeof input !== 'object') return undefined
  const value = Number((input as { value?: unknown }).value)
  return Number.isFinite(value) ? roundMoney(value / 100) : undefined
}

function numeric(value: string | number | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function humanize(code: string): string {
  const text = code.replaceAll('_', ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function benefitsOf(order: IfoodApiOrder): MarketplaceBenefit[] {
  return (order.benefits ?? []).map((benefit) => ({
    amount: benefit.value ?? 0,
    description: benefit.campaign?.name || undefined,
    sponsors: (benefit.sponsorshipValues ?? [])
      .filter((sponsor) => (sponsor.value ?? 0) > 0)
      .map((sponsor) => ({ name: SPONSOR_LABELS[sponsor.name ?? ''] ?? sponsor.description ?? sponsor.name ?? '', amount: sponsor.value ?? 0 })),
  }))
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
    brand: method.card?.brand || undefined,
    prepaid: method.prepaid ?? method.type === 'ONLINE',
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
    table: order.indoor?.table || undefined,
    scheduledFor:
      order.orderTiming === 'SCHEDULED' ? order.schedule?.deliveryDateTimeStart ?? order.takeout?.takeoutDateTime : undefined,
    customerName: order.customer?.name?.trim() || 'Cliente iFood',
    customerPhone: phone?.number ? (phone.localizer ? `${phone.number} (código ${phone.localizer})` : phone.number) : undefined,
    customerDocument: order.customer?.documentNumber || undefined,
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
    benefits: benefitsOf(order),
    orderAmount: order.total?.orderAmount ?? 0,
    payments,
    deliveryAddress:
      type === 'delivery' && formattedAddress
        ? { formatted: formattedAddress, complement: address?.complement || undefined, reference: address?.reference || undefined }
        : undefined,
    deliveredBy: order.delivery?.deliveredBy === 'MERCHANT' || type !== 'delivery' ? 'merchant' : 'platform',
    pickupCode: order.delivery?.pickupCode,
    notes: [order.delivery?.observations, order.extraInfo].filter(Boolean).join(' · ') || undefined,
  }
}
