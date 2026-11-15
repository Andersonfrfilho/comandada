/**
 * Resumo "Suas Seleções" do painel de conversas, montado a partir do que o bot realmente gravou.
 *
 * O painel lia `meta_whatsapp.sessions.context`, que ninguém preenche neste projeto: o bot é o
 * workflow do n8n e guarda o passo e o carrinho em `bot_sessions` (`PUT /internal/bot/:n/session`).
 * O resultado era tudo "a coletar" e o passo eterno "Início", mesmo com o pedido feito.
 *
 * Há dois momentos:
 * - pedido em andamento (carrinho com itens): os campos vêm do carrinho da sessão;
 * - pedido fechado: o bot zera o carrinho ao confirmar, então os campos vêm do último pedido gravado
 *   (endereço, forma de receber, pagamento, troco), que também aparece como "Último pedido".
 *
 * As chaves são as que `apps/web/src/pages/conversations/conversationContext.ts` sabe nomear.
 */

import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { BotConfigRepository } from '@/infra/database/BotConfigRepository'
import { API_ORDER_TYPE_TO_BOT } from '@/modules/bot/shared/bot.constant'
import type { OrderStatus, OrderType } from '@/shared/types'
import { CONVERSATION_START_STATE } from '../../shared/conversations.constant'

export interface PanelCartItem {
  readonly name: string
  readonly quantity: number
  readonly price: number
}

export interface PanelLastOrder {
  readonly code: string | null
  readonly status: OrderStatus
  readonly type: OrderType
  readonly totalAmount: number
  readonly receivedAt: Date
  readonly address: string | null
  readonly items: ReadonlyArray<PanelCartItem>
  readonly payments: ReadonlyArray<{ readonly method: string; readonly changeFor: number | null }>
}

export interface PanelContextSources {
  readonly session: { readonly state: string; readonly cart: Record<string, unknown> } | null
  readonly customerName: string | null
  readonly lastOrder: PanelLastOrder | null
  /** `name` da forma de pagamento/tipo de pedido do bot → rótulo cadastrado. */
  readonly paymentLabels: Readonly<Record<string, string>>
  readonly orderTypeLabels: Readonly<Record<string, string>>
}

export interface PanelContext {
  readonly currentState: string
  readonly context: Record<string, unknown>
}

const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  received: 'Recebido',
  in_production: 'Em preparo',
  ready: 'Pronto',
  in_delivery: 'Saiu para entrega',
  picked_up: 'Retirado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

const FALLBACK_ORDER_TYPE_LABELS: Readonly<Record<string, string>> = {
  delivery: 'Entrega',
  retirada: 'Retirada',
  mesa: 'Mesa',
}

const DELIVERY_ORDER_TYPE = 'delivery'

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/** Itens do carrinho do bot (`{ name, qty, price }`) no formato que o painel soma. */
function cartItemsOf(cart: Record<string, unknown>): PanelCartItem[] {
  const items = cart['items']
  if (!Array.isArray(items)) return []
  return items.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const name = text(record['name'])
    if (!name) return []
    return [{ name, quantity: positiveNumber(record['qty']) ?? 1, price: positiveNumber(record['price']) ?? 0 }]
  })
}

function labelOf(name: string | undefined, labels: Readonly<Record<string, string>>): string | undefined {
  if (!name) return undefined
  return labels[name] ?? FALLBACK_ORDER_TYPE_LABELS[name] ?? name
}

function moneyOf(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `Troco para ${currencyFormatter.format(value)}`
}

function lastOrderSummary(order: PanelLastOrder): string {
  const items = order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')
  const parts = [
    order.code,
    ORDER_STATUS_LABELS[order.status],
    currencyFormatter.format(order.totalAmount),
    dateTimeFormatter.format(order.receivedAt),
  ].filter((part): part is string => Boolean(part))
  return items ? `${parts.join(' · ')} — ${items}` : parts.join(' · ')
}

function withoutEmpty(entries: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined && value !== null))
}

function fromCart(sources: PanelContextSources, cart: Record<string, unknown>, items: PanelCartItem[]) {
  const orderType = text(cart['order_type'])
  const paymentMethod = text(cart['payment_method'])
  return {
    address: orderType === DELIVERY_ORDER_TYPE ? text(cart['address']) : undefined,
    complement: orderType === DELIVERY_ORDER_TYPE ? text(cart['complement']) : undefined,
    deliveryType: labelOf(orderType, sources.orderTypeLabels),
    paymentType: labelOf(paymentMethod, sources.paymentLabels),
    change: moneyOf(positiveNumber(cart['change_for'])),
    cart: items,
  }
}

function fromLastOrder(sources: PanelContextSources, order: PanelLastOrder) {
  const payments = order.payments.map((payment) => labelOf(payment.method, sources.paymentLabels))
  const changeFor = order.payments.find((payment) => payment.changeFor !== null)?.changeFor ?? undefined
  return {
    address: order.type === 'delivery' ? (order.address ?? undefined) : undefined,
    deliveryType: labelOf(API_ORDER_TYPE_TO_BOT[order.type], sources.orderTypeLabels),
    paymentType: payments.length > 0 ? [...new Set(payments)].join(' + ') : undefined,
    change: moneyOf(positiveNumber(changeFor)),
  }
}

export function buildPanelContext(sources: PanelContextSources): PanelContext {
  const cart = sources.session?.cart ?? {}
  const items = cartItemsOf(cart)
  const collected =
    items.length > 0
      ? fromCart(sources, cart, items)
      : sources.lastOrder
        ? fromLastOrder(sources, sources.lastOrder)
        : {}

  return {
    currentState: sources.session?.state ?? CONVERSATION_START_STATE,
    context: withoutEmpty({
      name: sources.customerName ?? undefined,
      ...collected,
      lastOrder: sources.lastOrder ? lastOrderSummary(sources.lastOrder) : undefined,
    }),
  }
}

export interface ConversationPanelContextReader {
  read(params: { establishmentId: string; whatsappNumber: string }): Promise<PanelContext>
}

type Database = NodePgDatabase<typeof schema>

function amount(value: string | null): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function addressOf(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  return text((snapshot as Record<string, unknown>)['address']) ?? null
}

export class DrizzleConversationPanelContextReader implements ConversationPanelContextReader {
  constructor(
    private readonly db: Database,
    private readonly botConfig: Pick<BotConfigRepository, 'listActivePaymentTypes' | 'listActiveOrderTypes'>
  ) {}

  async read(params: { establishmentId: string; whatsappNumber: string }): Promise<PanelContext> {
    const [session, customer, paymentTypes, orderTypes] = await Promise.all([
      this.db.query.botSessions.findFirst({
        where: and(
          eq(schema.botSessions.establishmentId, params.establishmentId),
          eq(schema.botSessions.whatsappNumber, params.whatsappNumber)
        ),
      }),
      this.db.query.customers.findFirst({
        where: and(
          eq(schema.customers.establishmentId, params.establishmentId),
          eq(schema.customers.whatsappNumber, params.whatsappNumber)
        ),
      }),
      this.botConfig.listActivePaymentTypes(),
      this.botConfig.listActiveOrderTypes(),
    ])

    return buildPanelContext({
      session: session ? { state: session.state, cart: (session.cart ?? {}) as Record<string, unknown> } : null,
      // O bot cadastra o cliente com o próprio número como nome até ele se apresentar.
      customerName: customer && customer.name !== customer.whatsappNumber ? customer.name : null,
      lastOrder: customer ? await this.loadLastOrder(params.establishmentId, customer.id) : null,
      paymentLabels: Object.fromEntries(paymentTypes.map((paymentType) => [paymentType.name, paymentType.label])),
      orderTypeLabels: Object.fromEntries(orderTypes.map((orderType) => [orderType.name, orderType.label])),
    })
  }

  private async loadLastOrder(establishmentId: string, customerId: string): Promise<PanelLastOrder | null> {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(schema.orders.establishmentId, establishmentId), eq(schema.orders.customerId, customerId)),
      orderBy: [desc(schema.orders.receivedAt)],
    })
    if (!order) return null

    const [items, payments, delivery] = await Promise.all([
      this.db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id) }),
      this.db.query.orderPayments.findMany({ where: eq(schema.orderPayments.orderId, order.id) }),
      this.db.query.deliveries.findFirst({ where: eq(schema.deliveries.orderId, order.id) }),
    ])

    return {
      code: order.code,
      status: order.status,
      type: order.type,
      totalAmount: amount(order.totalAmount),
      receivedAt: order.receivedAt,
      address: delivery ? addressOf(delivery.addressSnapshot) : null,
      items: items.map((item) => ({ name: item.productName, quantity: item.quantity, price: amount(item.unitPrice) })),
      payments: payments.map((payment) => ({
        method: payment.paymentTypeName,
        changeFor: payment.changeFor === null ? null : amount(payment.changeFor),
      })),
    }
  }
}
