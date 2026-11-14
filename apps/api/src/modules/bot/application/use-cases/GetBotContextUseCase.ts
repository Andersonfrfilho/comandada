import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { BotConfigRepository, DeliveryFeeRuleRow, PaymentTypeRow } from '@/infra/database/BotConfigRepository'
import type { PaymentAccountService } from '@/modules/payments/application/services/PaymentAccountService'
import { CARD_LINK_PAYMENT_TYPE } from '@/modules/payments/shared/payments.constant'
import { NotFoundError } from '@/shared/errors/AppError'
import { brandStickerUrl } from '@/modules/settings/shared/brandSticker.constant'
import { BRANDING_SETTING_KEYS } from '@/modules/settings/shared/branding.constant'
import type { ListScheduledOrderSlotsUseCase, ScheduledOrderDay } from '@/modules/agenda/application/use-cases/ListScheduledOrderSlotsUseCase'
import type { BotCustomerService } from '../services/BotCustomerService'
import { API_ORDER_STATUS_TO_BOT, API_ORDER_TYPE_TO_BOT, RECENT_ORDERS_LIMIT } from '../../shared/bot.constant'

type Database = NodePgDatabase<typeof schema>

export interface GetBotContextParams {
  whatsappNumber: string
  instance?: string | undefined
}

interface BotOrderSummary {
  code: string
  status: string
  order_type: string
  total: number
  created_at: string
  // Previsão prometida (ISO) e horário da encomenda, para o "onde está meu pedido".
  estimated_at: string | null
  scheduled_for: string | null
  completed_at: string | null
  items: Array<{ id: string; name: string; qty: number; price: number }>
}

// Same shape the bot used to read from the legacy "Buscar Dados" SQL node, so the bot code is unchanged.
export class GetBotContextUseCase {
  constructor(
    private readonly db: Database,
    private readonly botConfigRepository: BotConfigRepository,
    private readonly customerService: BotCustomerService,
    private readonly listScheduleSlots: Pick<ListScheduledOrderSlotsUseCase, 'execute'>,
    private readonly paymentAccounts?: Pick<PaymentAccountService, 'findActive'>,
    private readonly publicApiUrl?: string
  ) {}

  async execute(params: GetBotContextParams): Promise<Record<string, unknown>> {
    const establishment = await this.resolveEstablishment(params.instance)
    const establishmentId = establishment.id
    const customer = await this.customerService.findByNumber({ establishmentId, whatsappNumber: params.whatsappNumber })

    const [config, products, session, recentOrders, paymentTypes, orderTypes, tables, deliveryFeeRule, scheduleSlots, conversation, partialConfirmation] =
      await Promise.all([
        this.loadConfig(establishmentId),
        this.loadProducts(establishmentId),
        this.loadSession(establishmentId, params.whatsappNumber),
        customer ? this.loadRecentOrders(customer.id) : Promise.resolve([]),
        this.loadPaymentTypes(establishmentId),
        this.botConfigRepository.listActiveOrderTypes(),
        this.loadTables(establishmentId),
        this.botConfigRepository.getActiveDeliveryFeeRule(),
        this.loadScheduleSlots(establishmentId),
        this.loadConversation(establishmentId, params.whatsappNumber),
        customer ? this.loadPartialConfirmation(establishmentId, customer.id) : Promise.resolve(null),
      ])

    return {
      establishment: {
        active: true,
        ...(isRecord(establishment.settings) ? establishment.settings : {}),
        id: establishmentId,
        name: establishment.name,
        whatsapp_number: establishment.whatsappNumber,
        // Figurinha do logo (Configurações → Marca) que abre a saudação; null sem logo.
        sticker_url: this.publicApiUrl
          ? brandStickerUrl(this.publicApiUrl, establishmentId, config[BRANDING_SETTING_KEYS.logo])
          : null,
      },
      config,
      products,
      session,
      last_order: recentOrders[0] ?? null,
      recent_orders: recentOrders,
      payment_types: paymentTypes,
      order_types: orderTypes,
      restaurant_tables: tables,
      upcoming_reservations: [],
      schedule_slots: scheduleSlots,
      delivery_fee_rule: deliveryFeeRule ? toBotFeeRule(deliveryFeeRule) : null,
      customer_name: customer && customer.name !== customer.whatsappNumber ? customer.name : null,
      marketing_opt_in: null,
      conversation,
      partial_confirmation: partialConfirmation,
    }
  }

  /** Pergunta "seguir sem os itens em falta?" esperando o SIM/NÃO do cliente. */
  private async loadPartialConfirmation(establishmentId: string, customerId: string) {
    const [pending] = await this.db
      .select({ confirmation: schema.orderPartialConfirmations, order: schema.orders })
      .from(schema.orderPartialConfirmations)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderPartialConfirmations.orderId))
      .where(
        and(
          eq(schema.orderPartialConfirmations.establishmentId, establishmentId),
          eq(schema.orderPartialConfirmations.status, 'pending'),
          eq(schema.orders.customerId, customerId)
        )
      )
      .orderBy(desc(schema.orderPartialConfirmations.createdAt))
      .limit(1)
    if (!pending) return null
    const items = await this.db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, pending.order.id) })
    const unavailableIds = pending.confirmation.unavailableItemIds
    const remainingTotal = items
      .filter((item) => !unavailableIds.includes(item.id))
      .reduce((sum, item) => sum + Number(item.totalPrice), 0)
    return {
      order_code: pending.order.code ?? pending.order.id.slice(0, 8).toUpperCase(),
      unavailable: items.filter((item) => unavailableIds.includes(item.id)).map((item) => item.productName),
      new_total: Math.round((remainingTotal + Number(pending.order.deliveryFee ?? 0)) * 100) / 100,
    }
  }

  private async resolveEstablishment(instance?: string): Promise<schema.Establishment> {
    if (instance) {
      const byNumber = await this.db.query.establishments.findFirst({
        where: eq(schema.establishments.whatsappNumber, instance),
      })
      if (byNumber) return byNumber
    }
    const first = await this.db.query.establishments.findFirst({ orderBy: asc(schema.establishments.createdAt) })
    if (!first) throw new NotFoundError('establishment_not_found')
    return first
  }

  // Com a conta de pagamento ligada, Pix vira cobrança online (`config.online`) e entra o cartão pelo link.
  // Se a conta não carrega, o bot segue com as formas de pagamento de sempre.
  private async loadPaymentTypes(establishmentId: string): Promise<PaymentTypeRow[]> {
    const paymentTypes = await this.botConfigRepository.listActivePaymentTypes()
    const account = await this.paymentAccounts?.findActive(establishmentId).catch((error: unknown) => {
      console.error('[Bot] payment account unavailable:', error instanceof Error ? error.message : error)
      return undefined
    })
    if (!account) return paymentTypes
    const withPix = paymentTypes.map((paymentType) =>
      paymentType.name === 'pix' && account.pixEnabled
        ? { ...paymentType, config: { ...paymentType.config, online: 'true' } }
        : paymentType
    )
    if (!account.cardLinkEnabled) return withPix
    return [...withPix, { id: 0, ...CARD_LINK_PAYMENT_TYPE, config: { online: 'true' } }]
  }

  // Encomenda is an extra; if the agenda is down the bot still takes orders "para agora".
  private async loadScheduleSlots(establishmentId: string): Promise<ScheduledOrderDay[]> {
    return this.listScheduleSlots.execute({ establishmentId, now: new Date() }).catch((error: unknown) => {
      console.error('[Bot] schedule slots unavailable:', error instanceof Error ? error.message : error)
      return []
    })
  }

  private async loadConfig(establishmentId: string): Promise<Record<string, string>> {
    const rows = await this.db.query.settings.findMany({ where: eq(schema.settings.establishmentId, establishmentId) })
    return Object.fromEntries(
      rows.map((row) => [row.key, typeof row.value === 'string' ? row.value : JSON.stringify(row.value)])
    )
  }

  private async loadProducts(establishmentId: string) {
    const rows = await this.db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        price: schema.products.price,
        description: schema.products.description,
        category: schema.catalogs.name,
        variant_group: schema.products.variantGroup,
        variant_label: schema.products.variantLabel,
      })
      .from(schema.products)
      .innerJoin(schema.catalogs, eq(schema.catalogs.id, schema.products.catalogId))
      .where(
        and(
          eq(schema.products.establishmentId, establishmentId),
          eq(schema.products.active, true),
          eq(schema.catalogs.active, true)
        )
      )
      .orderBy(asc(schema.catalogs.sortOrder), asc(schema.products.sortOrder), asc(schema.products.name))
    return rows.map((row) => ({ ...row, price: Number(row.price) }))
  }

  /**
   * Estado da conversa na inbox do painel. `mode: 'human'` = um atendente assumiu e o bot fica
   * calado; `human_requested` = o cliente pediu atendente e ninguém assumiu ainda.
   */
  private async loadConversation(establishmentId: string, whatsappNumber: string) {
    const result = await this.db
      .execute<{ mode: string; human_requested_at: Date | null }>(
        sql`SELECT mode, human_requested_at FROM meta_whatsapp.sessions WHERE company_id = ${establishmentId} AND whatsapp_number = ${whatsappNumber} LIMIT 1`
      )
      .catch((error: unknown) => {
        console.error('[Bot] conversation mode unavailable:', error instanceof Error ? error.message : error)
        return { rows: [] as Array<{ mode: string; human_requested_at: Date | null }> }
      })
    const row = result.rows[0]
    return { mode: row?.mode === 'human' ? 'human' : 'bot', human_requested: Boolean(row?.human_requested_at) }
  }

  private async loadSession(establishmentId: string, whatsappNumber: string) {
    const row = await this.db.query.botSessions.findFirst({
      where: and(
        eq(schema.botSessions.establishmentId, establishmentId),
        eq(schema.botSessions.whatsappNumber, whatsappNumber)
      ),
    })
    if (!row) return {}
    return {
      state: row.state,
      cart: row.cart,
      reservation_temp: row.reservationDraft,
      last_activity_at: row.lastActivityAt.toISOString(),
    }
  }

  private async loadRecentOrders(customerId: string): Promise<BotOrderSummary[]> {
    const orders = await this.db.query.orders.findMany({
      where: eq(schema.orders.customerId, customerId),
      orderBy: desc(schema.orders.createdAt),
      limit: RECENT_ORDERS_LIMIT,
    })
    if (orders.length === 0) return []
    const items = await this.db.query.orderItems.findMany({
      where: inArray(
        schema.orderItems.orderId,
        orders.map((order) => order.id)
      ),
    })
    return orders.map((order) => {
      const orderItems = items.filter((item) => item.orderId === order.id)
      return {
        code: order.code ?? order.id.slice(0, 8).toUpperCase(),
        status: API_ORDER_STATUS_TO_BOT[order.status],
        order_type: API_ORDER_TYPE_TO_BOT[order.type],
        total: Number(order.totalAmount),
        created_at: order.createdAt.toISOString(),
        estimated_at: order.estimatedAt?.toISOString() ?? null,
        scheduled_for: order.scheduledFor?.toISOString() ?? null,
        completed_at: order.completedAt?.toISOString() ?? null,
        items_count: orderItems.length,
        items: orderItems.map((item) => ({
          id: item.productId ?? item.id,
          name: item.productName,
          qty: item.quantity,
          price: Number(item.unitPrice),
        })),
      }
    })
  }

  private async loadTables(establishmentId: string) {
    return this.db
      .select({
        id: schema.restaurantTables.id,
        number: schema.restaurantTables.number,
        capacity: schema.restaurantTables.capacity,
      })
      .from(schema.restaurantTables)
      .where(eq(schema.restaurantTables.establishmentId, establishmentId))
      .orderBy(asc(schema.restaurantTables.number))
  }
}

function toBotFeeRule(rule: DeliveryFeeRuleRow) {
  return {
    id: rule.id,
    mode: rule.mode,
    base_fee: rule.baseFee,
    per_km_rate: rule.perKmRate,
    per_min_rate: rule.perMinRate,
    free_above: rule.freeAbove,
    max_radius_km: rule.maxRadiusKm,
    zones: rule.zones.map((zone) => ({
      type: zone.zoneType,
      min: zone.minValue,
      max: zone.maxValue,
      fee: zone.fee,
      label: zone.label,
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
