import type { CustomerRepository } from '../../domain/repositories/CustomerRepository'
import { NotFoundError } from '@/shared/errors/AppError'

export class DeleteCustomerUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(id: string, establishmentId: string): Promise<void> {
    const existing = await this.customerRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Cliente')
    await this.customerRepository.delete(id, establishmentId)
  }
}
