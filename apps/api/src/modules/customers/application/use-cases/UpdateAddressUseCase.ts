import type { AddressRepository, UpdateAddressInput } from '../../domain/repositories/AddressRepository'
import type { Address } from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

export class UpdateAddressUseCase {
  constructor(private readonly addressRepository: AddressRepository) {}

  async execute(id: string, customerId: string, input: UpdateAddressInput): Promise<Address> {
    const existing = await this.addressRepository.findById(id, customerId)
    if (!existing) throw new NotFoundError('Address')
    return this.addressRepository.update(id, customerId, input)
  }
}
