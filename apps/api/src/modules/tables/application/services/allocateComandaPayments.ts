export interface OutstandingOrder {
  orderId: string
  outstandingAmount: number
}

export interface ComandaPaymentPart {
  paymentTypeName: string
  amount: number
  changeFor?: number | undefined
  splitLabel?: string | undefined
}

export interface AllocatedPart extends ComandaPaymentPart {
  orderId: string
}

const toCents = (value: number) => Math.round(value * 100)

/**
 * Reparte as partes do pagamento da conta (pessoa 1 no cartão, pessoa 2 no dinheiro…) entre os
 * pedidos da comanda, na ordem em que foram lançados, para cada pedido entrar no caixa com a forma
 * certa. Uma parte que passa do que falta num pedido continua no próximo. Arredondamento da divisão
 * (3 x 33,33 de 100,00) vai para o último pedido. "Troco para" fica na parte que leva o dinheiro todo.
 */
export function allocateComandaPayments(
  orders: OutstandingOrder[],
  payments: ComandaPaymentPart[]
): AllocatedPart[] {
  const allocated: AllocatedPart[] = []
  const remainingByOrder = orders.map((order) => ({ orderId: order.orderId, cents: toCents(order.outstandingAmount) }))
  let orderIndex = 0

  for (const payment of payments) {
    let paymentCents = toCents(payment.amount)
    while (paymentCents > 0 && orderIndex < remainingByOrder.length) {
      const current = remainingByOrder[orderIndex]!
      const taken = Math.min(paymentCents, current.cents)
      if (taken > 0) {
        allocated.push({
          orderId: current.orderId,
          paymentTypeName: payment.paymentTypeName,
          amount: taken / 100,
          ...(payment.splitLabel ? { splitLabel: payment.splitLabel } : {}),
        })
      }
      paymentCents -= taken
      current.cents -= taken
      if (current.cents <= 0) orderIndex += 1
    }
    // Sobra de arredondamento: entra no último pedido em vez de sumir.
    if (paymentCents > 0 && allocated.length > 0) {
      const last = allocated[allocated.length - 1]!
      if (last.paymentTypeName === payment.paymentTypeName) last.amount = (toCents(last.amount) + paymentCents) / 100
      else {
        allocated.push({
          orderId: last.orderId,
          paymentTypeName: payment.paymentTypeName,
          amount: paymentCents / 100,
          ...(payment.splitLabel ? { splitLabel: payment.splitLabel } : {}),
        })
      }
    }
    if (payment.changeFor !== undefined) {
      const lastOfPayment = [...allocated].reverse().find((part) => part.paymentTypeName === payment.paymentTypeName)
      if (lastOfPayment) lastOfPayment.changeFor = payment.changeFor
    }
  }
  return allocated
}
