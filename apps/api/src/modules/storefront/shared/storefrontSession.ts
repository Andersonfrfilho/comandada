import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto'

// Cadastro opcional do cardápio online: o cliente prova que é dono do WhatsApp com um código de
// 6 números e recebe uma sessão assinada (sem senha, sem tabela nova). A sessão só abre os dados
// daquele telefone naquele restaurante.

export const LOGIN_CODE_LENGTH = 6
export const LOGIN_CODE_TTL_SECONDS = 10 * 60
export const LOGIN_CODE_MAX_ATTEMPTS = 5
/** Códigos pedidos para o mesmo telefone na janela abaixo (evita usar a página para mandar spam). */
export const LOGIN_CODE_MAX_SENDS = 3
export const LOGIN_CODE_SEND_WINDOW_SECONDS = 15 * 60
export const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60

const SESSION_VERSION = 'v1'

export interface StorefrontSessionPayload {
  /** Restaurante. */
  e: string
  /** Telefone confirmado (55 + DDD + número). */
  p: string
  /** Expira em (segundos desde 1970). */
  x: number
}

export function generateLoginCode(): string {
  return String(randomInt(0, 10 ** LOGIN_CODE_LENGTH)).padStart(LOGIN_CODE_LENGTH, '0')
}

/** O código não fica em texto no Redis. */
export function hashLoginCode(code: string, phone: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${phone}:${code}`).digest('base64url')
}

export function sameHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(`storefront-session:${body}`).digest('base64url')
}

export function createSessionToken(params: { establishmentId: string; phone: string; now: Date }, secret: string): string {
  const payload: StorefrontSessionPayload = {
    e: params.establishmentId,
    p: params.phone,
    x: Math.floor(params.now.getTime() / 1000) + SESSION_TTL_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${SESSION_VERSION}.${body}.${sign(body, secret)}`
}

/** Sessão válida, do restaurante pedido e dentro do prazo; senão null. */
export function readSessionToken(token: string, establishmentId: string, now: Date, secret: string): StorefrontSessionPayload | null {
  const [version, body, signature] = token.split('.')
  if (version !== SESSION_VERSION || !body || !signature) return null
  if (!sameHash(sign(body, secret), signature)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<StorefrontSessionPayload>
    if (typeof payload.e !== 'string' || typeof payload.p !== 'string' || typeof payload.x !== 'number') return null
    if (payload.e !== establishmentId || payload.x * 1000 <= now.getTime()) return null
    return { e: payload.e, p: payload.p, x: payload.x }
  } catch {
    return null
  }
}

/** "5516981234567" → "(16) 98123-4567". */
export function displayPhone(phone: string): string {
  const local = phone.startsWith('55') ? phone.slice(2) : phone
  const ddd = local.slice(0, 2)
  const number = local.slice(2)
  const split = number.length > 8 ? 5 : 4
  return `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`
}

export const STOREFRONT_LOGIN_MESSAGES = {
  code: (establishmentName: string, code: string) =>
    `Seu código para entrar no cardápio do ${establishmentName} é *${code}*. Vale por 10 minutos. Não passe para ninguém.`,
  tooManySends: 'Já mandamos códigos demais para esse número. Espere alguns minutos e tente de novo.',
  windowClosed: 'Para receber o código, mande um "oi" no nosso WhatsApp e tente de novo.',
  sendFailed: 'Não conseguimos mandar o código agora. Tente de novo em instantes.',
  invalidCode: 'Código errado. Confira a mensagem no WhatsApp.',
  expiredCode: 'Esse código venceu. Peça um novo.',
  tooManyAttempts: 'Muitas tentativas. Peça um código novo.',
  sessionExpired: 'Sua sessão expirou. Entre de novo.',
} as const

/**
 * Sessão inválida responde 403, não 401: o 401 dispara a renovação do login do painel no front, e o
 * cardápio é outra sessão.
 */
export const SESSION_EXPIRED_ERROR_CODE = 'storefront_session_expired'
export const SESSION_EXPIRED_STATUS = 403

/** Código do erro quando a janela de 24 h do WhatsApp está fechada: a página oferece o "mande um oi". */
export const WINDOW_CLOSED_ERROR_CODE = 'whatsapp_window_closed'
