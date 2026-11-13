import type { AddressRepository } from '../../domain/repositories/AddressRepository'
import { NotFoundError } from '@/shared/errors/AppError'

export class DeleteAddressUseCase {
  constructor(private readonly addressRepository: AddressRepository) {}

  async execute(id: string, customerId: string): Promise<void> {
    const existing = await this.addressRepository.findById(id, customerId)
    if (!existing) throw new NotFoundError('Address')
    await this.addressRepository.delete(id, customerId)
  }
}
