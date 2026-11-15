import type { Customer, Order } from '@/infra/database/schema'

export interface CustomerWithStats extends Customer {
  orderCount: number
  totalSpent: string
  averageTicket: string
  lastOrderAt: string | null
}

export interface CustomerDetails {
  customer: Customer
  stats: {
    orderCount: number
    totalSpent: string
    lastOrderAt: string | null
    firstOrderAt: string | null
  }
  recentOrders: Array<Pick<Order, 'id' | 'status' | 'totalAmount' | 'channel' | 'type' | 'receivedAt'>>
}

export interface CreateCustomerInput {
  establishmentId: string
  name: string
  whatsappNumber: string
  phone?: string
  document?: string
  birthDate?: string
  rating?: number | null
}

export interface UpdateCustomerInput {
  name?: string
  whatsappNumber?: string
  phone?: string | null
  document?: string | null
  birthDate?: string | null
  rating?: number | null
}

export const CUSTOMER_SORT_FIELDS = ['name', 'orderCount', 'totalSpent', 'averageTicket', 'lastOrderAt', 'createdAt'] as const
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number]
export type SortDirection = 'asc' | 'desc'

// Recortes da lista de clientes. "inactive" = já comprou, mas não pede há CUSTOMER_INACTIVE_DAYS dias.
export const CUSTOMER_SEGMENTS = ['with_orders', 'without_orders', 'inactive', 'birthday_month'] as const
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number]
export const CUSTOMER_INACTIVE_DAYS = 30

export interface ListCustomersByEstablishmentParams {
  establishmentId: string
  page?: number
  pageSize?: number
  search?: string
  sortBy?: CustomerSortField
  sortDirection?: SortDirection
  segment?: CustomerSegment
  minRating?: number
}

export interface CustomerRepository {
  listByEstablishment(params: ListCustomersByEstablishmentParams): Promise<{
    data: CustomerWithStats[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }>
  findById(id: string, establishmentId: string): Promise<Customer | null>
  findByWhatsApp(whatsappNumber: string, establishmentId: string): Promise<Customer | null>
  getDetails(id: string, establishmentId: string): Promise<CustomerDetails | null>
  create(input: CreateCustomerInput): Promise<Customer>
  update(id: string, establishmentId: string, input: UpdateCustomerInput): Promise<Customer>
  delete(id: string, establishmentId: string): Promise<void>
}
