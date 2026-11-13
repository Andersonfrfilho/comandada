import type { OrderStatus, OrderType, OrderChannel } from '@/shared/types'

export interface OrderEntity {
  id: string
  establishmentId: string
  customerId: string | null
  tableId: string | null
  channel: OrderChannel
  status: OrderStatus
  type: OrderType
  totalAmount: string
  notes: string | null
  whatsappMessageId: string | null
  receivedAt: Date
  productionStartedAt: Date | null
  readyAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  cancellationReason: string | null
  createdAt: Date
}

export interface OrderItemEntity {
  id: string
  orderId: string
  productId: string | null
  productName: string
  unitPrice: string
  quantity: number
  totalPrice: string
  notes: string | null
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  received: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['in_delivery', 'picked_up', 'completed'],
  in_delivery: ['completed', 'cancelled'],
  picked_up: ['completed'],
  completed: [],
  cancelled: [],
}

export function canTransitionTo(current: OrderStatus, next: OrderStatus): boolean {
  return STATUS_TRANSITIONS[current]?.includes(next) ?? false
}
