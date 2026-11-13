export interface AuthenticatedUser {
  id: string
  establishmentId: string
  email: string
  name: string
  role: string
  permissions: Array<{ resource: string; action: string }>
}

export interface PaginatedResult<TItem> {
  data: TItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface WebSocketEvent {
  type: string
  payload: unknown
  timestamp: string
}

export type OrderStatus =
  | 'received'
  | 'in_production'
  | 'ready'
  | 'in_delivery'
  | 'picked_up'
  | 'completed'
  | 'cancelled'

export type OrderType = 'delivery' | 'pickup' | 'table'

export type OrderChannel = 'whatsapp' | 'ifood' | 'manual'

export type DeliveryStatus = 'pending' | 'dispatched' | 'delivered' | 'failed'

export type CashRegisterStatus = 'open' | 'closed'

export type CashMovementType = 'payment' | 'withdrawal' | 'supply'

export type PaymentMethod = 'pix' | 'card_credit' | 'card_debit' | 'cash' | 'voucher'

export type TableStatus = 'available' | 'occupied' | 'reserved'

export type Resource =
  | 'orders'
  | 'kitchen'
  | 'cashier'
  | 'delivery'
  | 'users'
  | 'products'
  | 'reports'
  | 'settings'
  | 'conversations'
  | 'fiscal'
  | 'finance'

export type Action = 'read' | 'write' | 'delete' | 'manage'
