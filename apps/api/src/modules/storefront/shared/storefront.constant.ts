import { createHmac, timingSafeEqual } from 'crypto'

/** Limites das rotas públicas do cardápio online, por IP. */
export const STOREFRONT_RATE_LIMITS = {
  menu: { keyPrefix: 'storefront:menu', windowSeconds: 60, maxRequests: 120 },
  quote: { keyPrefix: 'storefront:quote', windowSeconds: 60, maxRequests: 30 },
  customer: { keyPrefix: 'storefront:customer', windowSeconds: 60, maxRequests: 10 },
  order: { keyPrefix: 'storefront:order', windowSeconds: 600, maxRequests: 6 },
  tracking: { keyPrefix: 'storefront:tracking', windowSeconds: 60, maxRequests: 60 },
  loginCode: { keyPrefix: 'storefront:login-code', windowSeconds: 600, maxRequests: 6 },
  loginVerify: { keyPrefix: 'storefront:login-verify', windowSeconds: 600, maxRequests: 20 },
  account: { keyPrefix: 'storefront:account', windowSeconds: 60, maxRequests: 60 },
} as const

export const STOREFRONT_ORDER_CODE_PREFIX = 'WEB-'

/** Tipos de pedido que o cardápio online oferece (mesa é pelo QR da comanda). */
export const STOREFRONT_ORDER_TYPES = ['delivery', 'retirada'] as const
export type StorefrontOrderType = (typeof STOREFRONT_ORDER_TYPES)[number]

export const CASH_PAYMENT_METHOD = 'dinheiro'

export const STOREFRONT_MESSAGES = {
  closed: 'Estamos fechados agora. Confira o horário e volte mais tarde.',
  orderTypeUnavailable: 'Essa forma de receber não está disponível agora.',
  paymentUnavailable: 'Essa forma de pagamento não está disponível.',
  invalidPhone: 'Informe o WhatsApp com DDD.',
  addressRequired: 'Informe o endereço de entrega.',
  noSavedAddress: 'Não achamos o endereço da última entrega. Digite o endereço.',
  outOfRange: 'Esse endereço fica fora da nossa área de entrega. Que tal retirar no balcão?',
  minOrder: (minimum: string) => `O pedido mínimo é ${minimum}.`,
  changeTooLow: 'O troco precisa ser para um valor maior que o total do pedido.',
  productUnavailable: 'Algum item do carrinho saiu do cardápio. Atualize a página e confira.',
} as const

const DEFAULT_OPENING_TIME = '18:00'
const DEFAULT_CLOSING_TIME = '23:00'
const DEFAULT_WORKING_DAYS = 'ter,qua,qui,sex,sab,dom'
const WEEKDAY_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const
const TIME_ZONE = 'America/Sao_Paulo'

export interface OpeningHours {
  openingTime: string
  closingTime: string
  workingDays: string[]
  ignoreHours: boolean
}

/** Horário com a mesma leitura do bot: configuração do estabelecimento, senão a tabela settings. */
export function openingHoursFrom(establishmentSettings: Record<string, unknown>, config: Record<string, string>): OpeningHours {
  const pick = (key: string): string | undefined => {
    const fromEstablishment = establishmentSettings[key]
    if (typeof fromEstablishment === 'string' && fromEstablishment.trim()) return fromEstablishment.trim()
    const fromConfig = config[key]
    return fromConfig && fromConfig.trim() ? fromConfig.trim() : undefined
  }
  const ignoreFromEstablishment = establishmentSettings['ignore_hours']
  return {
    openingTime: pick('opening_time') ?? DEFAULT_OPENING_TIME,
    closingTime: pick('closing_time') ?? DEFAULT_CLOSING_TIME,
    workingDays: (pick('working_days') ?? DEFAULT_WORKING_DAYS).split(',').map((day) => day.trim()).filter(Boolean),
    ignoreHours: typeof ignoreFromEstablishment === 'boolean' ? ignoreFromEstablishment : config['ignore_hours'] === 'true',
  }
}

/** Hora (HH:MM) e dia da semana (dom..sab) em São Paulo. */
export function saoPauloClock(now: Date): { time: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now)
  const valueOf = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(valueOf('weekday'))
  return { time: `${valueOf('hour')}:${valueOf('minute')}`, weekday: WEEKDAY_KEYS[weekdayIndex] ?? 'dom' }
}

/** Aberto agora: mesma regra do bot (dia da semana + entre abertura e fechamento). */
export function isOpenAt(hours: OpeningHours, now: Date): boolean {
  if (hours.ignoreHours) return true
  const { time, weekday } = saoPauloClock(now)
  return hours.workingDays.includes(weekday) && time >= hours.openingTime && time <= hours.closingTime
}

/**
 * WhatsApp digitado ("(16) 99999-1234") no formato do cadastro: 55 + DDD + número.
 * Devolve null quando não parece um celular/fixo brasileiro.
 */
export function normalizeBrazilianPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  if (!digits.startsWith('55') || (digits.length !== 12 && digits.length !== 13)) return null
  return digits
}

/**
 * O WhatsApp entrega alguns celulares sem o nono dígito (55 16 9999-1234). O cliente que já pediu pelo
 * bot pode estar cadastrado de um jeito e digitar do outro: procura pelos dois.
 */
export function phoneVariants(normalized: string): string[] {
  const ddd = normalized.slice(2, 4)
  const number = normalized.slice(4)
  if (number.length === 9 && number.startsWith('9')) return [normalized, `55${ddd}${number.slice(1)}`]
  if (number.length === 8 && /^[6-9]/.test(number)) return [normalized, `55${ddd}9${number}`]
  return [normalized]
}

/** Código do pedido do cardápio online, no mesmo molde do bot (PED-…): WEB-AAAAMMDDHHMMSS-1234. */
export function storefrontOrderCode(phone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const valueOf = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  const stamp = `${valueOf('year')}${valueOf('month')}${valueOf('day')}${valueOf('hour')}${valueOf('minute')}${valueOf('second')}`
  return `${STOREFRONT_ORDER_CODE_PREFIX}${stamp}-${phone.slice(-4)}`
}

/**
 * Quem fez o pedido acompanha pela página com um token assinado: o id sozinho não abre o pedido de
 * ninguém. O token não expira (é só leitura de status, sem endereço nem telefone).
 */
export function orderTrackingToken(orderId: string, secret: string): string {
  return createHmac('sha256', secret).update(`storefront-order:${orderId}`).digest('base64url').slice(0, 32)
}

export function isValidTrackingToken(orderId: string, token: string, secret: string): boolean {
  const expected = Buffer.from(orderTrackingToken(orderId, secret))
  const received = Buffer.from(token)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
