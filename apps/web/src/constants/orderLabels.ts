export type OrderStatus =
  | 'received'
  | 'in_production'
  | 'ready'
  | 'in_delivery'
  | 'picked_up'
  | 'completed'
  | 'cancelled'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Recebido',
  in_production: 'Em preparo',
  ready: 'Pronto',
  in_delivery: 'Em entrega',
  picked_up: 'Retirado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  received: 'bg-blue-100 text-blue-800',
  in_production: 'bg-yellow-100 text-yellow-800',
  ready: 'bg-green-100 text-green-800',
  in_delivery: 'bg-purple-100 text-purple-800',
  picked_up: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
}

export type OrderType = 'table' | 'delivery' | 'pickup'

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  table: 'Mesa',
  delivery: 'Entrega',
  pickup: 'Retirada',
}

export const ORDER_CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  ifood: 'iFood',
  manual: 'Manual',
}
