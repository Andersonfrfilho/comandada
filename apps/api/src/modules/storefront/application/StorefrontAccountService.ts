import type { BotSharedContext } from '@/modules/bot/application/use-cases/GetBotContextUseCase'
import { BRANDING_SETTING_KEYS } from '@/modules/settings/shared/branding.constant'
import { isWindowExpired } from '@/modules/conversations/application/services/OrderUpdateSender'
import { AppError, RateLimitError, UnprocessableError, ValidationError } from '@/shared/errors/AppError'
import type { BotMessageProvider } from '@/shared/providers/BotMessageProvider'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import { STOREFRONT_MESSAGES, normalizeBrazilianPhone, phoneVariants } from '../shared/storefront.constant'
import {
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_MAX_SENDS,
  LOGIN_CODE_SEND_WINDOW_SECONDS,
  LOGIN_CODE_TTL_SECONDS,
  STOREFRONT_LOGIN_MESSAGES,
  SESSION_EXPIRED_ERROR_CODE,
  SESSION_EXPIRED_STATUS,
  WINDOW_CLOSED_ERROR_CODE,
  createSessionToken,
  displayPhone,
  generateLoginCode,
  hashLoginCode,
  readSessionToken,
  sameHash,
} from '../shared/storefrontSession'
import type { StorefrontCustomer, StorefrontService } from './StorefrontService'

const SAVED_ADDRESSES_LIMIT = 4
const RECENT_ORDERS_LIMIT = 5

export interface StorefrontAccountOrder {
  id: string
  number: number | null
  createdAt: Date
  totalAmount: number
  type: string
  items: Array<{ productId: string | null; name: string; quantity: number; notes: string | null }>
}

export interface StorefrontAccountRepository {
  findCustomerByPhones(establishmentId: string, phones: string[]): Promise<StorefrontCustomer | null>
  /** Endereços das últimas entregas, sem repetir, do mais recente para o mais antigo. */
  deliveryAddresses(establishmentId: string, customerId: string, limit: number): Promise<string[]>
  lastPaymentMethod(customerId: string): Promise<string | null>
  recentOrders(establishmentId: string, customerId: string, limit: number): Promise<StorefrontAccountOrder[]>
}

export interface StorefrontAccount {
  phone: string
  phoneLabel: string
  name: string | null
  addresses: string[]
  lastPaymentMethod: string | null
  recentOrders: Array<{
    id: string
    number: number | null
    createdAt: string
    total: number
    type: string
    items: Array<{ productId: string; name: string; quantity: number; notes: string | null }>
  }>
}

interface StoredLoginCode {
  hash: string
  attempts: number
}

const codeKey = (establishmentId: string, phone: string) => `storefront:login:code:${establishmentId}:${phone}`
const sendsKey = (establishmentId: string, phone: string) => `storefront:login:sends:${establishmentId}:${phone}`

/**
 * Cadastro opcional do cardápio online. Entrar = provar o WhatsApp com um código que o próprio
 * número do restaurante manda. Com a sessão a página mostra os endereços já usados, a forma de
 * pagamento e os últimos pedidos (para repetir), o que antes ficava escondido por segurança.
 */
export class StorefrontAccountService {
  constructor(
    private readonly repository: StorefrontAccountRepository,
    private readonly contexts: Pick<StorefrontService, 'establishmentContext'>,
    private readonly messages: BotMessageProvider,
    private readonly cache: Pick<CacheProvider, 'get' | 'set' | 'delete' | 'increment' | 'expire' | 'ttl'>,
    private readonly secret: string,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async requestCode(params: { establishmentId: string; phone: string }): Promise<{ sentTo: string; expiresInSeconds: number }> {
    const context = await this.context(params.establishmentId)
    const phone = this.normalize(params.phone)

    const sends = await this.cache.increment(sendsKey(params.establishmentId, phone))
    if (sends === 1) await this.cache.expire(sendsKey(params.establishmentId, phone), LOGIN_CODE_SEND_WINDOW_SECONDS)
    if (sends > LOGIN_CODE_MAX_SENDS) {
      const ttl = await this.cache.ttl(sendsKey(params.establishmentId, phone)).catch(() => LOGIN_CODE_SEND_WINDOW_SECONDS)
      throw new RateLimitError(ttl > 0 ? ttl : LOGIN_CODE_SEND_WINDOW_SECONDS)
    }

    // O código vai para o número como está no cadastro (com ou sem o nono dígito), se o cliente já existe.
    const customer = await this.repository.findCustomerByPhones(params.establishmentId, phoneVariants(phone))
    const whatsappNumber = customer?.whatsappNumber ?? phone
    const code = generateLoginCode()
    const stored: StoredLoginCode = { hash: hashLoginCode(code, phone, this.secret), attempts: 0 }
    await this.cache.set(codeKey(params.establishmentId, phone), JSON.stringify(stored), LOGIN_CODE_TTL_SECONDS)

    try {
      await this.messages.sendText({
        establishmentId: params.establishmentId,
        whatsappNumber,
        body: STOREFRONT_LOGIN_MESSAGES.code(displayName(context), code),
      })
    } catch (error) {
      await this.cache.delete(codeKey(params.establishmentId, phone))
      if (isWindowExpired(error)) throw new AppError(STOREFRONT_LOGIN_MESSAGES.windowClosed, WINDOW_CLOSED_ERROR_CODE, 422)
      console.error('[Storefront] login code not sent:', error instanceof Error ? error.message : error)
      throw new UnprocessableError(STOREFRONT_LOGIN_MESSAGES.sendFailed)
    }
    return { sentTo: displayPhone(phone), expiresInSeconds: LOGIN_CODE_TTL_SECONDS }
  }

  async verifyCode(params: { establishmentId: string; phone: string; code: string }): Promise<{ token: string; account: StorefrontAccount }> {
    await this.context(params.establishmentId)
    const phone = this.normalize(params.phone)
    const key = codeKey(params.establishmentId, phone)
    const raw = await this.cache.get(key)
    if (!raw) throw new UnprocessableError(STOREFRONT_LOGIN_MESSAGES.expiredCode)
    const stored = JSON.parse(raw) as StoredLoginCode
    if (stored.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
      await this.cache.delete(key)
      throw new UnprocessableError(STOREFRONT_LOGIN_MESSAGES.tooManyAttempts)
    }
    const typed = params.code.replace(/\D/g, '')
    if (!sameHash(hashLoginCode(typed, phone, this.secret), stored.hash)) {
      const remaining = await this.cache.ttl(key).catch(() => LOGIN_CODE_TTL_SECONDS)
      await this.cache.set(key, JSON.stringify({ ...stored, attempts: stored.attempts + 1 }), remaining > 0 ? remaining : LOGIN_CODE_TTL_SECONDS)
      throw new UnprocessableError(STOREFRONT_LOGIN_MESSAGES.invalidCode)
    }
    await this.cache.delete(key)
    const token = createSessionToken({ establishmentId: params.establishmentId, phone, now: this.clock() }, this.secret)
    return { token, account: await this.loadAccount(params.establishmentId, phone) }
  }

  async account(params: { establishmentId: string; token: string }): Promise<StorefrontAccount> {
    await this.context(params.establishmentId)
    return this.loadAccount(params.establishmentId, this.sessionPhone(params.establishmentId, params.token))
  }

  /** Telefone da sessão; erro 401 quando a sessão não vale. Usado também no pedido. */
  sessionPhone(establishmentId: string, token: string): string {
    const session = readSessionToken(token, establishmentId, this.clock(), this.secret)
    if (!session) throw new AppError(STOREFRONT_LOGIN_MESSAGES.sessionExpired, SESSION_EXPIRED_ERROR_CODE, SESSION_EXPIRED_STATUS)
    return session.p
  }

  private async loadAccount(establishmentId: string, phone: string): Promise<StorefrontAccount> {
    const context = await this.context(establishmentId)
    const customer = await this.repository.findCustomerByPhones(establishmentId, phoneVariants(phone))
    const base = { phone, phoneLabel: displayPhone(phone) }
    if (!customer) return { ...base, name: null, addresses: [], lastPaymentMethod: null, recentOrders: [] }
    const [addresses, lastPayment, orders] = await Promise.all([
      this.repository.deliveryAddresses(establishmentId, customer.id, SAVED_ADDRESSES_LIMIT),
      this.repository.lastPaymentMethod(customer.id),
      this.repository.recentOrders(establishmentId, customer.id, RECENT_ORDERS_LIMIT),
    ])
    const activePayment = lastPayment && context.paymentTypes.some((paymentType) => paymentType.name === lastPayment) ? lastPayment : null
    // Cliente que só falou com o bot sem dizer o nome fica com o telefone no lugar do nome.
    const name = customer.name && customer.name !== customer.whatsappNumber ? customer.name : null
    return {
      ...base,
      name,
      addresses,
      lastPaymentMethod: activePayment,
      recentOrders: orders.map((order) => ({
        id: order.id,
        number: order.number,
        createdAt: order.createdAt.toISOString(),
        total: order.totalAmount,
        type: order.type,
        items: order.items
          .filter((item): item is typeof item & { productId: string } => Boolean(item.productId))
          .map((item) => ({ productId: item.productId, name: item.name, quantity: item.quantity, notes: item.notes })),
      })),
    }
  }

  private normalize(raw: string): string {
    const phone = normalizeBrazilianPhone(raw)
    if (!phone) throw new ValidationError(STOREFRONT_MESSAGES.invalidPhone, { phone: [STOREFRONT_MESSAGES.invalidPhone] })
    return phone
  }

  private async context(establishmentId: string): Promise<BotSharedContext> {
    return this.contexts.establishmentContext(establishmentId)
  }
}

/** Nome da marca (Configurações) quando há; senão o nome do cadastro. */
function displayName(context: BotSharedContext): string {
  const settings = context.establishment.settings
  const fromSettings = typeof settings === 'object' && settings !== null && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)[BRANDING_SETTING_KEYS.name]
    : undefined
  const brand = typeof fromSettings === 'string' && fromSettings.trim() ? fromSettings : context.config[BRANDING_SETTING_KEYS.name]
  return brand?.trim() || context.establishment.name
}
