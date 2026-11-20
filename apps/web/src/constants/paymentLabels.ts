// The bot stores payment_types.name (pix, cartao, dinheiro); older rows stored the label itself.
const PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  pix: 'PIX',
  cartao: 'Cartão',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  card_credit: 'Cartão de crédito',
  card_debit: 'Cartão de débito',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  dinheiro: 'Dinheiro',
  cash: 'Dinheiro',
  voucher: 'Vale-refeição',
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method
}

type PaymentChangeInput = {
  readonly amount: string
  readonly changeFor: string | null
}

/** Quanto o entregador leva de troco; undefined quando não tem troco. */
export function paymentChangeAmount(payment: PaymentChangeInput): number | undefined {
  if (payment.changeFor === null) return undefined
  const change = Number(payment.changeFor) - Number(payment.amount)
  return change > 0 ? change : undefined
}

// "Troco p/ R$ 100,00 (levar R$ 51,00)" — the courier needs the change amount, not only the bill.
export function paymentChangeText(payment: PaymentChangeInput): string | undefined {
  if (payment.changeFor === null) return undefined
  const amount = Number(payment.amount)
  const changeFor = Number(payment.changeFor)
  if (!(changeFor > amount)) return undefined
  return `Troco p/ ${formatBrl(changeFor)} (levar ${formatBrl(changeFor - amount)})`
}

function formatBrl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

/** A mesma regra de faturamento no Dashboard, nos Relatórios e no Financeiro (ver API: reports/shared/revenue). */
export const REVENUE_RULE_HINT = 'Pedidos concluídos, menos devoluções'
