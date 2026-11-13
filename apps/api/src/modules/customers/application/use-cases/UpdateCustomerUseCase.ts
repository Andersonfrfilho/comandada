import type { CustomerRepository, UpdateCustomerInput } from '../../domain/repositories/CustomerRepository'
import type { Customer } from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

export class UpdateCustomerUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(id: string, establishmentId: string, input: UpdateCustomerInput): Promise<Customer> {
    const existing = await this.customerRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Cliente')
    return this.customerRepository.update(id, establishmentId, input)
  }
}
