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
  | 'concluded'
  | 'other'

export interface MarketplaceEvent {
  id: string
  /** Código como a plataforma manda (PLC, CAN, CREATED…), para o registro. */
  code: string
  kind: MarketplaceEventKind
  orderId: string
  merchantId?: string | undefined
  createdAt?: string | undefined
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

export interface MarketplaceOrder {
  platform: MarketplacePlatform
  externalId: string
  /** Número curto que o cliente e o entregador da plataforma veem. */
  displayId: string
  merchantId?: string | undefined
  type: 'delivery' | 'pickup' | 'table'
  scheduledFor?: string | undefined
  customerName: string
  /** Telefone ou localizador (o iFood mascara: 0800 + código). Só para contato, nunca WhatsApp. */
  customerPhone?: string | undefined
  items: MarketplaceOrderItem[]
  deliveryFee: number
  /** Desconto dado no pedido (cupom). Fica na observação; o total do painel é itens + taxa. */
  discount: number
  orderAmount: number
  payments: MarketplacePayment[]
  deliveryAddress?: MarketplaceAddress | undefined
  /** Quem entrega: a plataforma (entregador dela) ou o restaurante. */
  deliveredBy: 'platform' | 'merchant'
  pickupCode?: string | undefined
  notes?: string | undefined
}

/**
 * Ações que o painel manda para a plataforma. `delivered` só existe onde o restaurante entrega
 * (Open Delivery); no iFood a conclusão é dele.
 */
export type MarketplaceAction = 'confirm' | 'startPreparation' | 'readyForPickup' | 'dispatch' | 'delivered'

export interface MarketplaceProvider {
  readonly platform: MarketplacePlatform
  /** Busca os eventos novos (polling). */
  pollEvents(): Promise<MarketplaceEvent[]>
  /** Avisa a plataforma que os eventos foram tratados, para não virem de novo. */
  acknowledge(events: MarketplaceEvent[]): Promise<void>
  getOrder(externalId: string): Promise<MarketplaceOrder>
  sendAction(externalId: string, action: MarketplaceAction, order?: { deliveredBy: string | null }): Promise<void>
  requestCancellation(externalId: string, reason: string): Promise<void>
  /** Confere a assinatura do webhook (corpo cru). Plataforma sem webhook devolve false. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean
  /** Transforma o corpo do webhook em eventos. */
  parseWebhook(body: unknown): MarketplaceEvent[]
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
