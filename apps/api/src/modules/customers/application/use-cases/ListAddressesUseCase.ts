import type { AddressRepository } from '../../domain/repositories/AddressRepository'
import type { Address } from '@/infra/database/schema'

export class ListAddressesUseCase {
  constructor(private readonly addressRepository: AddressRepository) {}

  async execute(customerId: string): Promise<Address[]> {
    return this.addressRepository.listByCustomer(customerId)
  }
}
