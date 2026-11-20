import { orderBotCode } from '@/modules/orders/shared/orderNumber'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { AUDIO_ORDERS_CONFIG_KEY } from '@/shared/constants/featureFlags.constant'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { BotConfigRepository, DeliveryFeeRuleRow, PaymentTypeRow } from '@/infra/database/BotConfigRepository'
import type { PaymentAccountService } from '@/modules/payments/application/services/PaymentAccountService'
import { CARD_LINK_PAYMENT_TYPE } from '@/modules/payments/shared/payments.constant'
import { NotFoundError } from '@/shared/errors/AppError'
import type { EstablishmentLocationService } from '@/modules/settings/application/services/EstablishmentLocationService'
import { brandHeaderUrl, brandStickerUrl } from '@/modules/settings/shared/brandSticker.constant'
import { BRANDING_SETTING_KEYS } from '@/modules/settings/shared/branding.constant'
import { menuContentVersion, menuPdfUrl } from '@/modules/menu/shared/menuPdf.constant'
import type { ListScheduledOrderSlotsUseCase, ScheduledOrderDay } from '@/modules/agenda/application/use-cases/ListScheduledOrderSlotsUseCase'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import type { BotCustomerService } from '../services/BotCustomerService'
import {
  API_ORDER_STATUS_TO_BOT,
  API_ORDER_TYPE_TO_BOT,
  BOT_SHARED_CONTEXT_CACHE_PREFIX,
  RECENT_ORDERS_LIMIT,
} from '../../shared/bot.constant'

type Database = NodePgDatabase<typeof schema>

export interface GetBotContextParams {
  whatsappNumber: string
  instance?: string | undefined
  /** `contacts[].profile.name` da mensagem que chegou; grava o nome do contato. */
  profileName?: string | undefined
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
  // Forma de pagamento quando o pedido foi pago de um jeito só (sem divisão nem misto); senão null.
  payment_method: string | null
  items: Array<{ id: string; name: string; qty: number; price: number }>
}

interface BotProduct {
  id: string
  name: string
  price: number
  description: string | null
  category: string
  variant_group: string | null
  variant_label: string | null
  /** Versão da foto (`products.image_version`); null sem foto. */
  image_version: string | null
}

interface BotTable {
  id: string
  number: number
  capacity: number
}

type DeliveryFeeRule = Awaited<ReturnType<BotConfigRepository['getActiveDeliveryFeeRule']>>

/**
 * Parte do contexto que é igual para todo cliente do restaurante (cardápio, configurações, formas de
 * pagamento, mesas, taxa). É a parte cara e vai para o Redis por alguns segundos: cada mensagem do
 * WhatsApp chama o contexto, e assim o n8n recebe a resposta sem refazer essas consultas.
 */
export interface BotSharedContext {
  establishment: Pick<schema.Establishment, 'id' | 'name' | 'whatsappNumber' | 'settings'>
  config: Record<string, string>
  products: BotProduct[]
  paymentTypes: PaymentTypeRow[]
  orderTypes: Awaited<ReturnType<BotConfigRepository['listActiveOrderTypes']>>
  tables: BotTable[]
  deliveryFeeRule: DeliveryFeeRule
  coordinates: { latitude: number; longitude: number } | null
}

export interface BotSharedContextCache {
  cache: Pick<CacheProvider, 'get' | 'set'>
  /** 0 desliga o cache. */
  ttlSeconds: number
}

// Same shape the bot used to read from the legacy "Buscar Dados" SQL node, so the bot code is unchanged.
export class GetBotContextUseCase {
  constructor(
    private readonly db: Database,
    private readonly botConfigRepository: BotConfigRepository,
    private readonly customerService: BotCustomerService,
    private readonly listScheduleSlots: Pick<ListScheduledOrderSlotsUseCase, 'execute'>,
    private readonly paymentAccounts?: Pick<PaymentAccountService, 'findActive'>,
    private readonly publicApiUrl?: string,
    private readonly establishmentLocation?: Pick<EstablishmentLocationService, 'resolve'>,
    private readonly sharedContextCache?: BotSharedContextCache,
    /** FEATURE_AUDIO_ORDERS: o bot só oferece e aceita áudio com ela ligada. */
    private readonly audioOrdersEnabled: boolean = false
  ) {}

  async execute(params: GetBotContextParams): Promise<Record<string, unknown>> {
    const { establishment, config, products, paymentTypes, orderTypes, tables, deliveryFeeRule, coordinates } =
      await this.loadSharedContext(params.instance)
    const establishmentId = establishment.id
    const customer = await this.findCustomer(establishmentId, params)

    // O que é do cliente (sessão, pedidos, conversa) e a agenda mudam a cada mensagem: sempre do banco.
    const [session, recentOrders, scheduleSlots, conversation, partialConfirmation, lastDeliveryAddress] = await Promise.all([
      this.loadSession(establishmentId, params.whatsappNumber),
      customer ? this.loadRecentOrders(customer.id) : Promise.resolve([]),
      this.loadScheduleSlots(establishmentId),
      this.loadConversation(establishmentId, params.whatsappNumber),
      customer ? this.loadPartialConfirmation(establishmentId, customer.id) : Promise.resolve(null),
      customer ? this.loadLastDeliveryAddress(establishmentId, customer.id) : Promise.resolve(null),
    ])

    return {
      establishment: {
        active: true,
        ...(isRecord(establishment.settings) ? establishment.settings : {}),
        id: establishmentId,
        name: establishment.name,
        whatsapp_number: establishment.whatsappNumber,
        ...(coordinates ? { lat: coordinates.latitude, lng: coordinates.longitude } : {}),
        // Figurinha do logo (Configurações → Marca) que abre a saudação; null sem logo.
        sticker_url: this.publicApiUrl
          ? brandStickerUrl(this.publicApiUrl, establishmentId, config[BRANDING_SETTING_KEYS.logo])
          : null,
        // Logo na faixa da cor da marca, no topo da mensagem única da saudação; null sem logo.
        header_image_url: this.publicApiUrl
          ? brandHeaderUrl(this.publicApiUrl, establishmentId, config[BRANDING_SETTING_KEYS.logo], config[BRANDING_SETTING_KEYS.primaryColor])
          : null,
        // "📄 Ver cardápio completo": PDF gerado do cadastro; a versão muda junto com cardápio, logo e cor.
        menu_pdf_url: this.publicApiUrl && products.length > 0
          ? menuPdfUrl(
              this.publicApiUrl,
              establishmentId,
              menuContentVersion({
                products,
                name: establishment.name,
                logo: config[BRANDING_SETTING_KEYS.logo] ?? null,
                color: config[BRANDING_SETTING_KEYS.primaryColor] ?? null,
                address: config['establishment_address'] ?? null,
                city: config['establishment_city'] ?? null,
                instagram: config['establishment_instagram'] ?? null,
              })
            )
          : null,
      },
      config: { ...config, [AUDIO_ORDERS_CONFIG_KEY]: this.audioOrdersEnabled ? 'true' : 'false' },
      products,
      session,
      last_order: recentOrders[0] ?? null,
      recent_orders: recentOrders,
      // Endereço da última entrega (com complemento): o bot oferece "Usar este endereço" ao escolher Entregar.
      last_delivery_address: lastDeliveryAddress,
      payment_types: paymentTypes,
      order_types: orderTypes,
      restaurant_tables: tables,
      upcoming_reservations: [],
      schedule_slots: scheduleSlots,
      delivery_fee_rule: deliveryFeeRule ? toBotFeeRule(deliveryFeeRule) : null,
      customer_name: customer && customer.name !== customer.whatsappNumber ? customer.name : null,
      // Nulo enquanto o cliente não respondeu: o bot pergunta uma vez e para de perguntar.
      marketing_opt_in: customer?.marketingOptIn ?? null,
      conversation,
      partial_confirmation: partialConfirmation,
    }
  }

  /** Restaurante do número e os nomes do cardápio, do mesmo cache do contexto (pedido por áudio). */
  async menuFor(instance?: string): Promise<{ establishmentId: string; productNames: string[] }> {
    const { establishment, products } = await this.loadSharedContext(instance)
    return { establishmentId: establishment.id, productNames: products.map((product) => product.name) }
  }

  /** Cardápio, configurações e formas de pagamento do restaurante (mesmo cache do bot): o cardápio online lê daqui. */
  async sharedContext(instance?: string): Promise<BotSharedContext> {
    return this.loadSharedContext(instance)
  }

  private async loadSharedContext(instance?: string): Promise<BotSharedContext> {
    const ttlSeconds = this.sharedContextCache?.ttlSeconds ?? 0
    const cache = ttlSeconds > 0 ? this.sharedContextCache?.cache : undefined
    const cacheKey = `${BOT_SHARED_CONTEXT_CACHE_PREFIX}${instance ?? 'default'}`

    // Redis fora do ar não derruba o bot: só volta a ler do banco.
    const cached = cache ? await cache.get(cacheKey).catch(() => null) : null
    if (cached) {
      try {
        return JSON.parse(cached) as BotSharedContext
      } catch {
        // valor corrompido: lê do banco e regrava
      }
    }

    const establishment = await this.resolveEstablishment(instance)
    const establishmentId = establishment.id
    const [config, products, paymentTypes, orderTypes, tables, deliveryFeeRule] = await Promise.all([
      this.loadConfig(establishmentId),
      this.loadProducts(establishmentId),
      this.loadPaymentTypes(establishmentId),
      this.botConfigRepository.listActiveOrderTypes(),
      this.loadTables(establishmentId),
      this.botConfigRepository.getActiveDeliveryFeeRule(),
    ])
    // Pin do restaurante na saudação: coordenadas do endereço (geocodificado uma vez e salvo) ou digitadas.
    const coordinates = this.establishmentLocation
      ? await this.establishmentLocation.resolve(establishmentId, config).catch(() => null)
      : null

    const shared: BotSharedContext = {
      establishment: {
        id: establishment.id,
        name: establishment.name,
        whatsappNumber: establishment.whatsappNumber,
        settings: establishment.settings,
      },
      config,
      products,
      paymentTypes,
      orderTypes,
      tables,
      deliveryFeeRule,
      coordinates: coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude } : null,
    }
    if (cache) {
      await cache.set(cacheKey, JSON.stringify(shared), ttlSeconds).catch((error: unknown) => {
        console.error('[Bot] context cache unavailable:', error instanceof Error ? error.message : error)
      })
    }
    return shared
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
    const deliveryFee = Number(pending.order.deliveryFee ?? 0)
    const remainingTotal = items
      .filter((item) => !unavailableIds.includes(item.id))
      .reduce((sum, item) => sum + Number(item.totalPrice), 0)
    // Troca sugerida pela equipe: o cliente aceita, escolhe outra opção da lista ou segue sem o item.
    const substitutions = (pending.confirmation.substitutions ?? []).flatMap((substitution) => {
      const item = items.find((candidate) => candidate.id === substitution.itemId)
      if (!item) return []
      const toBot = (product: { productId: string; productName: string; unitPrice: number }) => ({
        product_id: product.productId,
        name: product.productName,
        price: product.unitPrice,
      })
      return [{
        item_id: item.id,
        item_name: item.productName,
        quantity: item.quantity,
        suggested: toBot(substitution.suggested),
        alternatives: substitution.alternatives.map(toBot),
      }]
    })
    const suggestedTotal = substitutions.reduce((sum, substitution) => sum + substitution.suggested.price * substitution.quantity, 0)
    const roundCents = (value: number) => Math.round(value * 100) / 100
    return {
      order_code: orderBotCode(pending.order),
      unavailable: items.filter((item) => unavailableIds.includes(item.id)).map((item) => item.productName),
      // Com troca: total aceitando as sugestões. Sem troca: total sem os itens em falta.
      new_total: roundCents(remainingTotal + suggestedTotal + deliveryFee),
      total_without: roundCents(remainingTotal + deliveryFee),
      items_kept: items.filter((item) => !unavailableIds.includes(item.id)).length,
      substitutions,
    }
  }

  // Gravar o nome do perfil é extra: se falhar, o bot responde do mesmo jeito.
  private async findCustomer(establishmentId: string, params: GetBotContextParams): Promise<schema.Customer | undefined | null> {
    const lookup = { establishmentId, whatsappNumber: params.whatsappNumber }
    if (!params.profileName) return this.customerService.findByNumber(lookup)
    try {
      return await this.customerService.recordProfileName({ ...lookup, profileName: params.profileName })
    } catch (error: unknown) {
      console.error('[Bot] profile name not saved:', error instanceof Error ? error.message : error)
      return this.customerService.findByNumber(lookup)
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

  private async loadProducts(establishmentId: string): Promise<BotProduct[]> {
    const rows = await this.db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        price: schema.products.price,
        description: schema.products.description,
        category: schema.catalogs.name,
        variant_group: schema.products.variantGroup,
        variant_label: schema.products.variantLabel,
        image_version: schema.products.imageVersion,
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
    const payments = await this.db
      .select({ orderId: schema.orderPayments.orderId, method: schema.orderPayments.paymentTypeName })
      .from(schema.orderPayments)
      .where(inArray(schema.orderPayments.orderId, orders.map((order) => order.id)))
    return orders.map((order) => {
      const orderItems = items.filter((item) => item.orderId === order.id)
      const methods = payments.filter((payment) => payment.orderId === order.id).map((payment) => payment.method)
      return {
        code: orderBotCode(order),
        status: API_ORDER_STATUS_TO_BOT[order.status],
        order_type: API_ORDER_TYPE_TO_BOT[order.type],
        total: Number(order.totalAmount),
        created_at: order.createdAt.toISOString(),
        estimated_at: order.estimatedAt?.toISOString() ?? null,
        scheduled_for: order.scheduledFor?.toISOString() ?? null,
        completed_at: order.completedAt?.toISOString() ?? null,
        payment_method: singlePaymentMethod(methods),
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

  private async loadLastDeliveryAddress(establishmentId: string, customerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ snapshot: schema.deliveries.addressSnapshot })
      .from(schema.deliveries)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.deliveries.orderId))
      .where(and(eq(schema.orders.customerId, customerId), eq(schema.deliveries.establishmentId, establishmentId)))
      .orderBy(desc(schema.deliveries.createdAt))
      .limit(1)
    return row ? deliveryAddressText(row.snapshot) : null
  }

  private async loadTables(establishmentId: string): Promise<BotTable[]> {
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

/** Pedido pago numa parte só: essa forma. Divisão ou misto (mais de uma parte) não vira "pagar igual". */
export function singlePaymentMethod(methods: string[]): string | null {
  return methods.length === 1 ? methods[0] ?? null : null
}

/** Endereço + complemento do snapshot da entrega; o bot já grava o complemento junto do endereço. */
export function deliveryAddressText(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const record = snapshot as Record<string, unknown>
  const address = typeof record['address'] === 'string' ? record['address'].trim() : ''
  if (!address) return null
  const complement = typeof record['complement'] === 'string' ? record['complement'].trim() : ''
  return complement && !address.includes(complement) ? `${address}, ${complement}` : address
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
