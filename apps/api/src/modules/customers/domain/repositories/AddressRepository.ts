import type { Address } from '@/infra/database/schema'

export interface CreateAddressInput {
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  zip?: string
  label?: string
  lat?: number
  lng?: number
}

export interface UpdateAddressInput {
  street?: string
  number?: string
  complement?: string | null
  neighborhood?: string
  city?: string
  state?: string
  zip?: string | null
  label?: string | null
  lat?: number | null
  lng?: number | null
}

export interface AddressRepository {
  listByCustomer(customerId: string): Promise<Address[]>
  findById(id: string, customerId: string): Promise<Address | null>
  create(customerId: string, input: CreateAddressInput): Promise<Address>
  update(id: string, customerId: string, input: UpdateAddressInput): Promise<Address>
  delete(id: string, customerId: string): Promise<void>
  setDefault(id: string, customerId: string): Promise<Address>
}
