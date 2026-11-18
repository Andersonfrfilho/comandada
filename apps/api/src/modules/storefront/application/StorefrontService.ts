import type { BotSharedContext, GetBotContextUseCase } from '@/modules/bot/application/use-cases/GetBotContextUseCase'
import type { CreateBotOrderUseCase, CreateBotOrderResult } from '@/modules/bot/application/use-cases/CreateBotOrderUseCase'
import type { CalculateDeliveryFeeUseCase, DeliveryFeeQuote } from '@/modules/delivery/application/use-cases/CalculateDeliveryFeeUseCase'
import { BRANDING_SETTING_KEYS } from '@/modules/settings/shared/branding.constant'
import { NotFoundError, UnprocessableError, ValidationError } from '@/shared/errors/AppError'
import { groupStorefrontMenu, storefrontPaymentMethods, type StorefrontCategory, type StorefrontPaymentMethod } from './storefrontMenu'
import {
  CASH_PAYMENT_METHOD,
  STOREFRONT_MESSAGES,
  STOREFRONT_ORDER_TYPES,
  formatBrl,
  isOpenAt,
  isValidTrackingToken,
  normalizeBrazilianPhone,
  openingHoursFrom,
  orderTrackingToken,
  phoneVariants,
  roundCents,
  storefrontOrderCode,
  type StorefrontOrderType,
} from '../shared/storefront.constant'

export interface StorefrontEstablishmentRef {
  id: string
  whatsappNumber: string | null
}

export interface StorefrontCustomer {
  id: string
  name: string
  whatsappNumber: string | null
}

export interface StorefrontTrackedOrder {
  id: string
  establishmentId: string
  number: number | null
  code: string | null
  status: string
  paymentStatus: string
  type: string
  totalAmount: number
  deliveryFee: number
  estimatedAt: Date | null
  createdAt: Date
  items: Array<{ name: string; quantity: number; unitPrice: number; notes: string | null }>
  charge: { kind: string; status: string; pixCopyPaste: string | null; paymentUrl: string | null; expiresAt: Date | null } | null
  /** Formas de pagamento das partes do pedido (`order_payments`). */
  paymentMethods: string[]
}

export interface StorefrontRepository {
  findEstablishment(params: { establishmentId?: string | undefined; host?: string | undefined }): Promise<StorefrontEstablishmentRef | null>
  findCustomerByPhones(establishmentId: string, phones: string[]): Promise<StorefrontCustomer | null>
  /** Endereço da última entrega, já com o complemento (mesmo texto que o bot oferece). */
  lastDeliveryAddress(establishmentId: string, customerId: string): Promise<string | null>
  /** Forma de pagamento do último pedido quando foi paga numa parte só. */
  lastPaymentMethod(customerId: string): Promise<string | null>
  findOrderForTracking(orderId: string): Promise<StorefrontTrackedOrder | null>
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

export interface StorefrontCustomerLookup {
  known: boolean
  /** Há endereço da última entrega: a página oferece "entregar no mesmo endereço" sem mostrá-lo. */
  hasSavedAddress: boolean
  lastPaymentMethod: string | null
}

export interface PlaceStorefrontOrderParams {
  establishmentId: string
  phone: string
  name: string
  orderType: StorefrontOrderType
  items: Array<{ productId: string; quantity: number; notes?: string | undefined }>
  address?: string | undefined
  complement?: string | undefined
  useSavedAddress?: boolean | undefined
  paymentMethod: string
  changeFor?: number | undefined
  notes?: string | undefined
}

export interface PlaceStorefrontOrderResult {
  orderId: string
  number: number | null
  code: string
  trackingToken: string
  estimatedAt: string | null
  payment: CreateBotOrderResult['payment'] | null
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
  items: StorefrontTrackedOrder['items']
  payment: { kind: string; status: string; pixCopyPaste: string | null; paymentUrl: string | null; expiresAt: string | null } | null
  /** Pix sem cobrança online: a chave do restaurante para o cliente pagar e mandar o comprovante. */
  pixKey: { key: string; holder: string | null } | null
  establishment: { id: string; name: string; whatsappNumber: string | null }
}

/**
 * Cardápio online: a página pública lê o mesmo cardápio do bot e grava o pedido pelo mesmo caso de
 * uso (preço do catálogo, encomenda, cobrança Pix/link), só que com canal `web`.
 */
export class StorefrontService {
  constructor(
    private readonly repository: StorefrontRepository,
    private readonly botContext: Pick<GetBotContextUseCase, 'sharedContext'>,
    private readonly deliveryFees: Pick<CalculateDeliveryFeeUseCase, 'quote'>,
    private readonly createOrder: Pick<CreateBotOrderUseCase, 'execute'>,
    private readonly trackingSecret: string,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async menu(params: { establishmentId?: string | undefined; host?: string | undefined }): Promise<StorefrontMenu> {
    const { context } = await this.loadContext(params)
    const { establishment, config } = context
    const settings = isRecord(establishment.settings) ? establishment.settings : {}
    const hours = openingHoursFrom(settings, config)
    const text = (key: string): string | null => {
      const value = settings[key] ?? config[key]
      return typeof value === 'string' && value.trim() ? value.trim() : null
    }
    const rule = context.deliveryFeeRule
    return {
      establishment: {
        id: establishment.id,
        name: text(BRANDING_SETTING_KEYS.name) ?? establishment.name,
        logo: text(BRANDING_SETTING_KEYS.logo),
        primaryColor: text(BRANDING_SETTING_KEYS.primaryColor),
        address: text('establishment_address'),
        city: text('establishment_city'),
        instagram: text('establishment_instagram'),
        whatsappNumber: establishment.whatsappNumber ?? null,
        openingTime: hours.openingTime,
        closingTime: hours.closingTime,
        workingDays: hours.workingDays,
        isOpen: isOpenAt(hours, this.clock()),
        closedMessage: text('msg_closed')?.replace(/\\n/g, '\n') ?? null,
        minOrderValue: minOrderValue(settings, config),
      },
      categories: groupStorefrontMenu(context.products),
      orderTypes: availableOrderTypes(context),
      paymentMethods: storefrontPaymentMethods(context.paymentTypes),
      delivery: rule
        ? {
            baseFee: rule.baseFee,
            freeAbove: rule.freeAbove > 0 ? rule.freeAbove : null,
            maxRadiusKm: rule.maxRadiusKm > 0 ? rule.maxRadiusKm : null,
            byDistance: rule.mode === 'per_km' || rule.mode === 'zones_km',
          }
        : null,
    }
  }

  /** Taxa antes de fechar o pedido: pelo endereço digitado ou pelo da última entrega (sem mostrá-lo). */
  async quoteDelivery(params: {
    establishmentId: string
    address?: string | undefined
    phone?: string | undefined
    useSavedAddress?: boolean | undefined
    itemsTotal: number
  }): Promise<DeliveryFeeQuote> {
    const { context } = await this.loadContext({ establishmentId: params.establishmentId })
    let address = params.address?.trim()
    if (params.useSavedAddress) {
      const phone = params.phone ? normalizeBrazilianPhone(params.phone) : null
      const customer = phone ? await this.repository.findCustomerByPhones(context.establishment.id, phoneVariants(phone)) : null
      address = (customer ? await this.repository.lastDeliveryAddress(context.establishment.id, customer.id) : null) ?? undefined
      if (!address) throw new UnprocessableError(STOREFRONT_MESSAGES.noSavedAddress)
    }
    if (!address) throw new ValidationError(STOREFRONT_MESSAGES.addressRequired, { address: [STOREFRONT_MESSAGES.addressRequired] })
    return this.deliveryFees.quote({ address, itemsTotal: params.itemsTotal })
  }

  /**
   * Cliente que já pediu (pelo bot ou aqui). Não devolve nome nem endereço: qualquer um pode digitar
   * um telefone, então a página só sabe que existe um endereço salvo e qual foi a forma de pagamento.
   */
  async lookupCustomer(params: { establishmentId: string; phone: string }): Promise<StorefrontCustomerLookup> {
    const { context } = await this.loadContext({ establishmentId: params.establishmentId })
    const phone = normalizeBrazilianPhone(params.phone)
    if (!phone) throw new ValidationError(STOREFRONT_MESSAGES.invalidPhone, { phone: [STOREFRONT_MESSAGES.invalidPhone] })
    const customer = await this.repository.findCustomerByPhones(context.establishment.id, phoneVariants(phone))
    if (!customer) return { known: false, hasSavedAddress: false, lastPaymentMethod: null }
    const [savedAddress, lastPayment] = await Promise.all([
      this.repository.lastDeliveryAddress(context.establishment.id, customer.id),
      this.repository.lastPaymentMethod(customer.id),
    ])
    const activePayment = lastPayment && context.paymentTypes.some((paymentType) => paymentType.name === lastPayment) ? lastPayment : null
    return { known: true, hasSavedAddress: Boolean(savedAddress), lastPaymentMethod: activePayment }
  }

  async placeOrder(params: PlaceStorefrontOrderParams): Promise<PlaceStorefrontOrderResult> {
    const { context } = await this.loadContext({ establishmentId: params.establishmentId })
    const establishmentId = context.establishment.id
    const settings = isRecord(context.establishment.settings) ? context.establishment.settings : {}
    const now = this.clock()

    if (!isOpenAt(openingHoursFrom(settings, context.config), now)) throw new UnprocessableError(STOREFRONT_MESSAGES.closed)
    if (!availableOrderTypes(context).includes(params.orderType)) throw new UnprocessableError(STOREFRONT_MESSAGES.orderTypeUnavailable)
    if (!context.paymentTypes.some((paymentType) => paymentType.name === params.paymentMethod)) {
      throw new UnprocessableError(STOREFRONT_MESSAGES.paymentUnavailable)
    }

    const phone = normalizeBrazilianPhone(params.phone)
    if (!phone) throw new ValidationError(STOREFRONT_MESSAGES.invalidPhone, { phone: [STOREFRONT_MESSAGES.invalidPhone] })

    // Total dos itens pelo cardápio (o caso de uso do bot reprecifica de novo ao gravar).
    const priceById = new Map(context.products.map((product) => [product.id, product.price]))
    if (params.items.some((item) => !priceById.has(item.productId))) throw new UnprocessableError(STOREFRONT_MESSAGES.productUnavailable)
    const itemsTotal = roundCents(params.items.reduce((sum, item) => sum + (priceById.get(item.productId) ?? 0) * item.quantity, 0))
    const minimum = minOrderValue(settings, context.config)
    if (minimum > 0 && itemsTotal < minimum) throw new UnprocessableError(STOREFRONT_MESSAGES.minOrder(formatBrl(minimum)))

    const customer = await this.repository.findCustomerByPhones(establishmentId, phoneVariants(phone))

    let address: string | undefined
    let complement: string | undefined
    let deliveryFee = 0
    if (params.orderType === 'delivery') {
      if (params.useSavedAddress) {
        const saved = customer ? await this.repository.lastDeliveryAddress(establishmentId, customer.id) : null
        if (!saved) throw new UnprocessableError(STOREFRONT_MESSAGES.noSavedAddress)
        address = saved
      } else {
        address = params.address?.trim()
        complement = params.complement?.trim() || undefined
      }
      if (!address) throw new ValidationError(STOREFRONT_MESSAGES.addressRequired, { address: [STOREFRONT_MESSAGES.addressRequired] })
      // A taxa é sempre calculada aqui, nunca vem do navegador.
      const quote = await this.deliveryFees.quote({ address, itemsTotal })
      if (quote.outOfRange) throw new UnprocessableError(STOREFRONT_MESSAGES.outOfRange)
      deliveryFee = quote.feeAmount
    }

    const total = roundCents(itemsTotal + deliveryFee)
    const isCash = params.paymentMethod === CASH_PAYMENT_METHOD
    const changeFor = isCash && params.changeFor && params.changeFor > 0 ? params.changeFor : undefined
    if (changeFor !== undefined && changeFor < total) throw new UnprocessableError(STOREFRONT_MESSAGES.changeTooLow)

    // Quem já tem nome no cadastro continua com ele: o telefone digitado aqui não é confirmado.
    const keepsRegisteredName = Boolean(customer && customer.name !== customer.whatsappNumber)
    const code = storefrontOrderCode(phone, now)
    const created = await this.createOrder.execute({
      establishmentId,
      whatsappNumber: customer?.whatsappNumber ?? phone,
      customerName: keepsRegisteredName ? undefined : params.name.trim(),
      code,
      orderType: params.orderType,
      items: params.items.map((item) => ({ productId: item.productId, quantity: item.quantity, notes: item.notes?.trim() || undefined })),
      paymentMethod: params.paymentMethod,
      changeFor,
      deliveryFee: params.orderType === 'delivery' ? deliveryFee : undefined,
      address,
      complement,
      notes: params.notes?.trim() || undefined,
      channel: 'web',
    })
    return {
      orderId: created.id,
      number: created.number ?? null,
      code,
      trackingToken: orderTrackingToken(created.id, this.trackingSecret),
      estimatedAt: created.estimatedAt ?? null,
      payment: created.payment ?? null,
    }
  }

  async orderStatus(params: { orderId: string; token: string }): Promise<StorefrontOrderStatus> {
    if (!isValidTrackingToken(params.orderId, params.token, this.trackingSecret)) throw new NotFoundError('Pedido')
    const order = await this.repository.findOrderForTracking(params.orderId)
    if (!order) throw new NotFoundError('Pedido')
    const { context } = await this.loadContext({ establishmentId: order.establishmentId })
    const settings = isRecord(context.establishment.settings) ? context.establishment.settings : {}
    const brandName = settings[BRANDING_SETTING_KEYS.name] ?? context.config[BRANDING_SETTING_KEYS.name]
    const offlinePix = !order.charge && order.paymentStatus !== 'paid' && order.paymentMethods.includes('pix')
      ? storefrontPaymentMethods(context.paymentTypes).find((method) => method.kind === 'pix' && method.pixKey)
      : undefined
    return {
      number: order.number,
      code: order.code,
      status: order.status,
      paymentStatus: order.paymentStatus,
      type: order.type,
      total: order.totalAmount,
      deliveryFee: order.deliveryFee,
      estimatedAt: order.estimatedAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      items: order.items,
      payment: order.charge
        ? { ...order.charge, expiresAt: order.charge.expiresAt?.toISOString() ?? null }
        : null,
      pixKey: offlinePix?.pixKey ? { key: offlinePix.pixKey, holder: offlinePix.pixHolder } : null,
      establishment: {
        id: context.establishment.id,
        name: typeof brandName === 'string' && brandName.trim() ? brandName.trim() : context.establishment.name,
        whatsappNumber: context.establishment.whatsappNumber ?? null,
      },
    }
  }

  private async loadContext(params: { establishmentId?: string | undefined; host?: string | undefined }): Promise<{ context: BotSharedContext }> {
    const establishment = await this.repository.findEstablishment(params)
    if (!establishment) throw new NotFoundError('Cardápio')
    const context = await this.botContext.sharedContext(establishment.whatsappNumber ?? undefined)
    if (context.establishment.id !== establishment.id) throw new NotFoundError('Cardápio')
    return { context }
  }
}

/** Entrega e retirada ativas em `order_types` (o bot lê a mesma tabela). */
function availableOrderTypes(context: BotSharedContext): StorefrontOrderType[] {
  const active = new Set(context.orderTypes.map((orderType) => orderType.name))
  return STOREFRONT_ORDER_TYPES.filter((orderType) => active.has(orderType))
}

function minOrderValue(settings: Record<string, unknown>, config: Record<string, string>): number {
  const fromSettings = settings['min_order_value']
  const value = fromSettings !== undefined && fromSettings !== null ? Number(fromSettings) : Number.parseFloat(config['min_order_value'] ?? '0')
  return Number.isFinite(value) && value > 0 ? value : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
