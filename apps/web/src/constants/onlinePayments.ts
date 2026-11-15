// Pagamento online (Pix/link de cartão) e devoluções no detalhe do pedido.

export interface OrderPaymentSummary {
  paymentStatus: string
  paid: string
  refunded: string
  refundable: string
  /** `online`: estorno pelo Mercado Pago; `manual`: devolvido no balcão; `none`: nada a devolver por aqui. */
  refundMode: 'online' | 'manual' | 'none'
  charges: Array<{
    id: string
    provider: string
    kind: string
    status: string
    amount: string
    providerPaymentId: string | null
    paidAt: string | null
    expiresAt: string | null
    createdAt: string
  }>
  refunds: Array<{
    id: string
    method: 'online' | 'manual'
    provider: string | null
    providerRefundId: string | null
    paymentMethod: string | null
    amount: string
    status: string
    reason: string | null
    failureMessage: string | null
    createdAt: string
    createdBy: string | null
  }>
}

export const ONLINE_PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
  awaiting: { label: 'Aguardando pagamento', className: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Pago online', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Pagamento expirou', className: 'bg-gray-200 text-gray-700' },
  partially_refunded: { label: 'Estorno parcial', className: 'bg-orange-100 text-orange-800' },
  refunded: { label: 'Estornado', className: 'bg-red-100 text-red-700' },
}

export const CHARGE_KIND_LABELS: Record<string, string> = {
  pix: 'Pix',
  payment_link: 'Link de cartão',
}

export const CHARGE_STATUS_LABELS: Record<string, string> = {
  pending: 'aguardando',
  approved: 'aprovado',
  failed: 'não pago',
  refunded: 'estornado',
  chargeback: 'contestado',
}

export const REFUND_STATUS_LABELS: Record<string, string> = {
  processing: 'processando',
  approved: 'devolvido',
  pending: 'em processamento no Mercado Pago',
  failed: 'recusado',
}

export const REFUND_COPY = {
  button: 'Devolver dinheiro',
  modalTitle: 'Devolver dinheiro ao cliente',
  onlineExplain: 'O estorno sai pelo Mercado Pago, na conta do restaurante, e volta pelo mesmo meio que o cliente pagou.',
  manualExplain:
    'Pedido pago no balcão: devolva o dinheiro na mão ou estorne na maquininha. Aqui fica o registro e a saída do caixa.',
  amountLabel: (available: string) => `Valor (até ${available})`,
  reasonLabel: 'Motivo',
  notifyLabel: 'Avisar o cliente pelo WhatsApp',
  confirm: (amount: string) => `Devolver ${amount}`,
  pending: 'Devolvendo...',
  onlineTag: 'Mercado Pago',
  manualTag: 'no balcão',
  forbidden: 'Só gerente ou administrador pode devolver dinheiro.',
  genericError: 'Não foi possível devolver.',
  providerOnly: 'Este pagamento não pode ser estornado por aqui. Devolva pelo painel do Mercado Pago.',
  cancelledWithMoney: (amount: string) => `Pedido cancelado com ${amount} ainda pago. Devolva ao cliente.`,
  cancelCheckbox: (amount: string) => `Devolver ${amount} ao cliente`,
  cancelRefundFailed: (message: string) => `O pedido foi cancelado, mas a devolução não saiu: ${message}`,
} as const
