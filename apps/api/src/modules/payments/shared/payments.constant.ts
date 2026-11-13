import { CHARGE_KIND } from '@adatechnology/payment-contracts'
import type { ChargeKind } from '@adatechnology/payment-contracts'
import { MERCADOPAGO_PROVIDER_NAME } from '@adatechnology/mercadopago-payment-provider'

export const PAYMENT_PROVIDER = {
  MERCADOPAGO: MERCADOPAGO_PROVIDER_NAME,
} as const
export type PaymentProviderName = (typeof PAYMENT_PROVIDER)[keyof typeof PAYMENT_PROVIDER]
export const PAYMENT_PROVIDER_VALUES = Object.values(PAYMENT_PROVIDER) as [PaymentProviderName, ...PaymentProviderName[]]

// Situação do pagamento online do pedido. `awaiting` segura o pedido fora da cozinha.
export const ORDER_PAYMENT_STATUS = {
  NOT_REQUIRED: 'not_required',
  AWAITING: 'awaiting',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUS)[keyof typeof ORDER_PAYMENT_STATUS]

// Pedido nessas situações não aparece na fila da cozinha.
export const PAYMENT_STATUSES_HELD_FROM_KITCHEN: readonly OrderPaymentStatus[] = [
  ORDER_PAYMENT_STATUS.AWAITING,
  ORDER_PAYMENT_STATUS.FAILED,
]

// Forma de pagamento que o bot manda → cobrança online. Só vira cobrança com a conta ligada.
export const CARD_LINK_PAYMENT_TYPE_NAME = 'link_cartao'
export const ONLINE_CHARGE_KIND_BY_METHOD: Readonly<Record<string, ChargeKind>> = {
  pix: CHARGE_KIND.PIX,
  [CARD_LINK_PAYMENT_TYPE_NAME]: CHARGE_KIND.PAYMENT_LINK,
}

// Linha que o bot mostra quando o restaurante aceita cartão pelo link.
export const CARD_LINK_PAYMENT_TYPE = {
  name: CARD_LINK_PAYMENT_TYPE_NAME,
  type: 'online',
  label: 'Cartão (link de pagamento)',
} as const

// Forma de pagamento do caixa quando o pagamento online cai.
export const CASH_METHOD_BY_CHARGE_KIND: Readonly<Record<ChargeKind, 'pix' | 'card_credit'>> = {
  [CHARGE_KIND.PIX]: 'pix',
  [CHARGE_KIND.PAYMENT_LINK]: 'card_credit',
}

export const PAYMENT_EXPIRATION_MINUTES = { MIN: 30, MAX: 24 * 60, DEFAULT: 30 } as const

// Cancelamento automático quando a cobrança expira sem pagar.
export const PAYMENT_EXPIRED_CANCELLATION_REASON = 'payment_expired'

// Varredura de links de cartão vencidos (Pix expirado o Mercado Pago avisa sozinho).
export const STALE_CHARGE_SWEEP_INTERVAL_MS = 5 * 60_000

export const PAYMENT_CUSTOMER_MESSAGES = {
  pixInstructions: (code: string, amount: string, minutes: number) =>
    `🔷 *Agora é só pagar o Pix do pedido ${code}!*\n\n💰 Valor: *${amount}*\n\nCopie o código da próxima mensagem e cole no app do seu banco, na opção _Pix copia e cola_. Ele vale por *${minutes} min*.\n\n👨‍🍳 Assim que o pagamento cair, seu pedido vai direto pra cozinha!`,
  pixTicket: (url: string) => `📱 Se preferir, abra o QR code por aqui: ${url}`,
  cardLink: (code: string, amount: string, url: string, minutes: number) =>
    `💳 *Agora é só pagar o pedido ${code} no cartão!*\n\n💰 Valor: *${amount}*\n👉 ${url}\n\nO link vale por *${minutes} min*. Assim que o pagamento for aprovado, seu pedido vai direto pra cozinha! 👨‍🍳`,
  unavailable: (code: string) =>
    `😕 Não consegui gerar o pagamento online do pedido *${code}* agora.\n\nMas fica tranquilo(a): o pedido está anotado e você paga na entrega ou na retirada. 😉`,
  paid: (code: string) => `✅ *Pagamento confirmado!* 🎉\n\nRecebemos direitinho e o pedido *${code}* já foi pra cozinha. 👨‍🍳`,
  expired: (code: string) =>
    `⌛ *O prazo para pagar o pedido ${code} acabou* e ele foi cancelado.\n\nSe ainda quiser, é só mandar um *oi* que a gente monta de novo rapidinho! 😊`,
  refunded: (code: string) => `↩️ O pagamento do pedido *${code}* foi estornado. O valor volta pelo mesmo meio que você pagou. 🧡`,
} as const

// Mesmos avisos em uma linha, para o template de fora da janela de 24 h.
export const PAYMENT_TEMPLATE_TEXTS = {
  paid: 'Recebemos o pagamento e ele já foi pra cozinha! 👨‍🍳',
  expired: 'O prazo para pagar acabou e ele foi cancelado. Se quiser, é só pedir de novo. 😊',
  refunded: 'O pagamento foi estornado e volta pelo mesmo meio que você pagou. 🧡',
} as const

export const PAYMENT_ERROR_MESSAGES = {
  providerUnsupported: 'Payment provider not supported',
  accountNotFound: 'Payment account not configured',
  credentialsRequired: 'Access token and webhook secret are required to connect the account',
} as const
