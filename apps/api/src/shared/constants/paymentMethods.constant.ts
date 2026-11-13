import type { PaymentMethod } from '@/shared/types'

// The bot stores payment_types.name (pix, cartao, dinheiro); older rows stored the label itself.
export const PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  pix: 'PIX',
  cartao: 'Cartão',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  card_credit: 'Cartão de crédito',
  card_debit: 'Cartão de débito',
  dinheiro: 'Dinheiro',
  cash: 'Dinheiro',
  voucher: 'Vale-refeição',
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method
}

// Forma de pagamento do pedido (nome do tipo, como o bot e o painel gravam) → forma do caixa.
// "cartao" sem débito/crédito entra como crédito, que é o caso comum na maquininha.
const CASH_METHOD_BY_PAYMENT_NAME: Readonly<Record<string, PaymentMethod>> = {
  pix: 'pix',
  dinheiro: 'cash',
  cash: 'cash',
  debito: 'card_debit',
  card_debit: 'card_debit',
  credito: 'card_credit',
  card_credit: 'card_credit',
  cartao: 'card_credit',
  link_cartao: 'card_credit',
  voucher: 'voucher',
  vale: 'voucher',
}

export function cashMethodForPaymentName(paymentTypeName: string): PaymentMethod | undefined {
  const normalized = paymentTypeName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  if (CASH_METHOD_BY_PAYMENT_NAME[normalized]) return CASH_METHOD_BY_PAYMENT_NAME[normalized]
  if (normalized.includes('debito')) return 'card_debit'
  if (normalized.includes('credito') || normalized.includes('cartao')) return 'card_credit'
  if (normalized.includes('dinheiro')) return 'cash'
  if (normalized.includes('pix')) return 'pix'
  if (normalized.includes('vale')) return 'voucher'
  return undefined
}
