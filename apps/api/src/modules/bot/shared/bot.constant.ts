import type { OrderStatus, OrderType } from '@/shared/types'

// The bot speaks the order vocabulary of the legacy n8n schema; the API keeps its own.
export const BOT_ORDER_TYPE_TO_API: Readonly<Record<string, OrderType>> = {
  delivery: 'delivery',
  retirada: 'pickup',
  mesa: 'table',
}

export const API_ORDER_TYPE_TO_BOT: Readonly<Record<OrderType, string>> = {
  delivery: 'delivery',
  pickup: 'retirada',
  table: 'mesa',
}

export const API_ORDER_STATUS_TO_BOT: Readonly<Record<OrderStatus, string>> = {
  received: 'received',
  in_production: 'preparing',
  ready: 'ready',
  in_delivery: 'out_for_delivery',
  picked_up: 'delivered',
  completed: 'delivered',
  cancelled: 'cancelled',
}

export const RECENT_ORDERS_LIMIT = 5
