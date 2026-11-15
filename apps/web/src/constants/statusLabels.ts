/**
 * Nome e cor de cada status num lugar só: o mesmo pedido aparecia como "Em entrega" roxo em Pedidos
 * e "Em rota" azul em Entregas, e nota cancelada era laranja numa tela e cinza na outra.
 * Status do pedido continuam em `orderLabels.ts`; entrega e nota seguem as mesmas cores.
 */
export type DeliveryStatus = 'pending' | 'dispatched' | 'delivered' | 'failed'

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'Aguardando',
  dispatched: 'Em entrega',
  delivered: 'Entregue',
  failed: 'Não entregue',
}

export const DELIVERY_STATUS_COLORS: Record<DeliveryStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  dispatched: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-700',
}

export type FiscalDocumentStatus = 'pending' | 'emitting' | 'authorized' | 'rejected' | 'cancelled'

export const FISCAL_STATUS_LABELS: Record<FiscalDocumentStatus, string> = {
  pending: 'Pendente',
  emitting: 'Emitindo',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
}

export const FISCAL_STATUS_COLORS: Record<FiscalDocumentStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  emitting: 'bg-blue-100 text-blue-800',
  authorized: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-600',
}
