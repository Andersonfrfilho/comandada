import type { CustomerRepository, CustomerDetails } from '../../domain/repositories/CustomerRepository'
import { NotFoundError } from '@/shared/errors/AppError'

export class GetCustomerDetailsUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(id: string, establishmentId: string): Promise<CustomerDetails> {
    const details = await this.customerRepository.getDetails(id, establishmentId)
    if (!details) throw new NotFoundError('Cliente não encontrado')
    return details
  }
}
