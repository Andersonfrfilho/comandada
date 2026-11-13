// A nota fiscal leva só os itens: a taxa de entrega está em `orders.totalAmount`, mas fica fora da soma.
export function fiscalTotalOf(order: { totalAmount: string; deliveryFee: string | null }): number {
  return Math.round((Number(order.totalAmount) - Number(order.deliveryFee ?? 0)) * 100) / 100
}
