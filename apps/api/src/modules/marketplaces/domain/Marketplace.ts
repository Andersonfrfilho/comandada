/**
 * Camada comum dos marketplaces (iFood, 99Food e o que vier depois). Cada plataforma traduz a própria
 * API para estes tipos; o resto do sistema (importar pedido, avisar status, cancelar) não sabe de onde veio.
 */

export type MarketplacePlatform = 'ifood' | '99food'

export const MARKETPLACE_PLATFORMS: readonly MarketplacePlatform[] = ['ifood', '99food']

export const MARKETPLACE_LABELS: Record<MarketplacePlatform, string> = {
  ifood: 'iFood',
  '99food': '99Food',
}

export function isMarketplacePlatform(value: string): value is MarketplacePlatform {
  return (MARKETPLACE_PLATFORMS as readonly string[]).includes(value)
}

/** O que importa para o painel em cada evento da plataforma. O resto é só registrado. */
export type MarketplaceEventKind =
  | 'placed'
  | 'confirmed'
  | 'cancelled'
  | 'cancellation_requested'
  /** A plataforma recusou o cancelamento pedido pelo restaurante. */
  | 'cancellation_failed'
  | 'concluded'
  /** Cliente pediu cancelamento, reembolso ou mais prazo e espera resposta do restaurante. */
  | 'dispute_opened'
  | 'dispute_settled'
  /** Itens ou valores mudaram depois da confirmação (cancelamento parcial, troca). */
  | 'order_patched'
  | 'address_changed'
  | 'other'

export interface MarketplaceEvent {
  id: string
  /** Código como a plataforma manda (PLC, CAN, orderNew…), para o registro. */
  code: string
  kind: MarketplaceEventKind
  orderId: string
  /** Loja na plataforma (merchantId do iFood, id da loja nas outras). */
  merchantId?: string | undefined
  createdAt?: string | undefined
  /** Dados do evento como vieram (motivo do cancelamento, disputa, endereço novo…). */
  metadata?: Record<string, unknown> | undefined
}

export interface MarketplaceOrderOption {
  name: string
  quantity: number
  unitPrice: number
}

export interface MarketplaceOrderItem {
  name: string
  /** Código do PDV cadastrado no item da plataforma (id do produto no ComandAdA, se mapeado). */
  externalCode?: string | undefined
  quantity: number
  /** Preço de uma unidade já com os adicionais. */
  unitPrice: number
  notes?: string | undefined
  options: MarketplaceOrderOption[]
}

export interface MarketplacePayment {
  /** Nome legível da forma (Pix, Crédito, Dinheiro…). */
  method: string
  /** Bandeira do cartão, quando vier. */
  brand?: string | undefined
  /** Pago online na plataforma: não passa pelo caixa do restaurante. */
  prepaid: boolean
  amount: number
  changeFor?: number | undefined
}

export interface MarketplaceAddress {
  formatted: string
  complement?: string | undefined
  reference?: string | undefined
}

export interface MarketplaceBenefit {
  /** Quanto o cliente deixou de pagar. */
  amount: number
  /** Quem paga o desconto (iFood, loja, indústria…), já legível. */
  sponsors: Array<{ name: string; amount: number }>
  description?: string | undefined
}

export interface MarketplaceOrder {
  platform: MarketplacePlatform
  externalId: string
  /** Número curto que o cliente e o entregador da plataforma veem. */
  displayId: string
  merchantId?: string | undefined
  type: 'delivery' | 'pickup' | 'table'
  /** Mesa informada no pedido para consumo no local (iFood INDOOR). */
  table?: string | undefined
  scheduledFor?: string | undefined
  customerName: string
  /** Telefone ou localizador (o iFood mascara: 0800 + código). Só para contato, nunca WhatsApp. */
  customerPhone?: string | undefined
  /** CPF ou CNPJ que o cliente pediu na nota. */
  customerDocument?: string | undefined
  items: MarketplaceOrderItem[]
  deliveryFee: number
  /** Desconto dado no pedido (cupom). Fica na observação; o total do painel é itens + taxa. */
  discount: number
  /** Cupons e descontos com quem paga cada um (exigência de homologação do iFood). */
  benefits?: MarketplaceBenefit[] | undefined
  orderAmount: number
  payments: MarketplacePayment[]
  deliveryAddress?: MarketplaceAddress | undefined
  /** Quem entrega: a plataforma (entregador dela) ou o restaurante. */
  deliveredBy: 'platform' | 'merchant'
  pickupCode?: string | undefined
  notes?: string | undefined
}

/**
 * Ações que o painel manda para a plataforma. `delivered` só existe onde o restaurante entrega;
 * `pickedUp` é o cliente retirando no balcão (Open Delivery). No iFood a conclusão é dele.
 */
export type MarketplaceAction =
  | 'confirm'
  | 'startPreparation'
  | 'readyForPickup'
  | 'dispatch'
  | 'delivered'
  | 'pickedUp'

/** Pedido como o painel conhece, para a plataforma saber a loja e como foi entregue. */
export interface MarketplaceOrderContext {
  merchantId?: string | null | undefined
  deliveredBy?: string | null | undefined
  type?: string | null | undefined
  /** Entregador do restaurante (há plataforma que exige nome e telefone ao despachar). */
  courier?: { name: string; phone?: string | null | undefined } | undefined
}

export interface MarketplaceCancellationReason {
  code: string
  description: string
}

export type MarketplaceDisputeKind = 'cancellation' | 'partial_cancellation' | 'refund' | 'delay' | 'other'

export interface MarketplaceDisputeAlternative {
  id: string
  type: 'refund' | 'additional_time' | 'other'
  /** Reembolso: valor máximo que pode ser oferecido. */
  maxAmount?: number | undefined
  /** Mais prazo: minutos e motivos aceitos. */
  minutes?: number[] | undefined
  reasons?: string[] | undefined
}

/** Negociação aberta pelo cliente (iFood: HANDSHAKE_DISPUTE; em outras, pedido de cancelamento ou reembolso). */
export interface MarketplaceDispute {
  externalId: string
  orderExternalId: string
  kind: MarketplaceDisputeKind
  message?: string | undefined
  /** Até quando o restaurante pode responder; depois a plataforma decide sozinha. */
  expiresAt?: string | undefined
  /** O que acontece sem resposta (ex.: reembolso automático, recusa automática). */
  timeoutAction?: string | undefined
  alternatives: MarketplaceDisputeAlternative[]
  /** Motivos para aceitar ou recusar, quando a plataforma dá a lista. */
  reasons?: string[] | undefined
  /** Itens do pedido envolvidos e fotos do cliente. */
  items?: Array<{ name?: string | undefined; quantity?: number | undefined; amount?: number | undefined; reason?: string | undefined }> | undefined
  evidenceUrls?: string[] | undefined
}

export type MarketplaceDisputeResponse =
  | { decision: 'accept'; reason?: string | undefined }
  | { decision: 'reject'; reason: string }
  | { decision: 'alternative'; alternativeId: string; amount?: number | undefined; minutes?: number | undefined; reason?: string | undefined }

export interface MarketplaceDisputeSettlement {
  disputeExternalId: string
  /** accepted, rejected, alternative_replied, expired… */
  status: string
}

export interface MarketplaceProvider {
  readonly platform: MarketplacePlatform
  /** Busca os eventos novos (polling). Plataforma só com webhook devolve []. */
  pollEvents(): Promise<MarketplaceEvent[]>
  /** Avisa a plataforma que os eventos foram tratados, para não virem de novo. */
  acknowledge(events: MarketplaceEvent[]): Promise<void>
  getOrder(externalId: string, context?: MarketplaceOrderContext): Promise<MarketplaceOrder>
  sendAction(externalId: string, action: MarketplaceAction, context?: MarketplaceOrderContext): Promise<void>
  /** Motivos que a plataforma aceita para cancelar este pedido agora ([] = não dá mais). */
  cancellationReasons(externalId: string, context?: MarketplaceOrderContext): Promise<MarketplaceCancellationReason[]>
  /** Pede o cancelamento com um código da lista. Só vale quando a plataforma confirmar. */
  requestCancellation(
    externalId: string,
    cancellation: { code?: string | undefined; reason: string },
    context?: MarketplaceOrderContext
  ): Promise<void>
  /** Lê a negociação de um evento `dispute_opened` (null se o evento não trouxer uma). */
  parseDispute(event: MarketplaceEvent): MarketplaceDispute | null
  /** Lê o fim de uma negociação de um evento `dispute_settled`. */
  parseDisputeSettlement(event: MarketplaceEvent): MarketplaceDisputeSettlement | null
  respondDispute(dispute: MarketplaceDispute, response: MarketplaceDisputeResponse, context?: MarketplaceOrderContext): Promise<void>
  /** Confere a assinatura do webhook (corpo cru). Plataforma sem webhook devolve false. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean
  /** Transforma o corpo do webhook em eventos (o corpo cru preserva ids de 64 bits). */
  parseWebhook(rawBody: Buffer, body: unknown): MarketplaceEvent[]
  /** Resposta que a plataforma espera do webhook (padrão: 202 com a contagem). */
  webhookResponse?(ok: boolean): { status: number; body: unknown }
  /** Vendas, taxas e repasses, quando a plataforma tem API financeira. */
  readonly financial?: MarketplaceFinancialProvider | undefined
  /** Avaliações dos clientes, quando a plataforma tem API (iFood). */
  readonly reviews?: MarketplaceReviewProvider | undefined
}

// ---------------------------------------------------------------- financeiro

export interface MarketplaceFinancialEntry {
  /** Nome legível (Comissão, Taxa de pagamento, Entrega…). */
  label: string
  /** Positivo entra para a loja, negativo sai. */
  amount: number
}

/** Uma venda (ou ajuste) como a plataforma vai pagar à loja. */
export interface MarketplaceSale {
  platform: MarketplacePlatform
  merchantId: string
  externalOrderId: string
  displayId?: string | undefined
  /** Data da venda (ISO). */
  date: string
  /** Situação do pedido na plataforma (concluído, cancelado, ajuste…). */
  status: string
  paymentMethod?: string | undefined
  /** Quem recebeu o pagamento do cliente (plataforma ou loja). */
  paymentLiability?: string | undefined
  /** Valor bruto (itens + entrega + serviço). */
  grossAmount: number
  /** Comissões, taxas, descontos pagos pela loja e subsídios recebidos. */
  entries: MarketplaceFinancialEntry[]
  /** Quanto a plataforma repassa por esta venda. */
  netAmount: number
  expectedTransferDate?: string | undefined
}

/** Repasse (pagamento da plataforma para a conta da loja). */
export interface MarketplaceSettlement {
  platform: MarketplacePlatform
  merchantId: string
  id: string
  periodStart?: string | undefined
  periodEnd?: string | undefined
  /** Data prevista ou feita do pagamento. */
  paymentDate?: string | undefined
  amount: number
  status: string
  type?: string | undefined
}

export interface MarketplaceDateRange {
  /** YYYY-MM-DD, inclusivo. */
  from: string
  to: string
}

export interface MarketplaceFinancialProvider {
  /** Maior período aceito numa consulta, em dias. */
  readonly maxRangeDays: number
  listSales(merchantId: string, range: MarketplaceDateRange): Promise<MarketplaceSale[]>
  listSettlements(merchantId: string, range: MarketplaceDateRange): Promise<MarketplaceSettlement[]>
}

// ---------------------------------------------------------------- avaliações

export interface MarketplaceReview {
  id: string
  score: number
  comment?: string | undefined
  customerName?: string | undefined
  createdAt: string
  /** NOT_REPLIED, REPLIED, PUBLISHED… */
  status: string
  canReply: boolean
  replies: Array<{ text: string; from: string; createdAt?: string | undefined }>
  order?: { id: string; displayId?: string | undefined; createdAt?: string | undefined } | undefined
}

export interface MarketplaceReviewPage {
  reviews: MarketplaceReview[]
  page: number
  pageCount: number
  total: number
}

export interface MarketplaceReviewSummary {
  score: number
  totalReviewsCount: number
  validReviewsCount: number
}

export interface MarketplaceReviewProvider {
  readonly policyUrl: string
  list(merchantId: string, options: { page: number; pageSize: number; dateFrom?: string | undefined; dateTo?: string | undefined }): Promise<MarketplaceReviewPage>
  answer(merchantId: string, reviewId: string, text: string): Promise<void>
  summary(merchantId: string): Promise<MarketplaceReviewSummary>
}

export class MarketplaceApiError extends Error {
  constructor(
    readonly platform: MarketplacePlatform,
    readonly operation: string,
    readonly status: number,
    readonly body: string
  ) {
    super(`[${MARKETPLACE_LABELS[platform]}] ${operation} falhou: ${status} ${body.slice(0, 300)}`)
    this.name = 'MarketplaceApiError'
  }
}
