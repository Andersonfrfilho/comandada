import type { AddressRepository, CreateAddressInput } from '../../domain/repositories/AddressRepository'
import type { Address } from '@/infra/database/schema'

export class CreateAddressUseCase {
  constructor(private readonly addressRepository: AddressRepository) {}

  async execute(customerId: string, input: CreateAddressInput): Promise<Address> {
    return this.addressRepository.create(customerId, input)
  }
}
