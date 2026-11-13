import type { CustomerRepository, CreateCustomerInput } from '../../domain/repositories/CustomerRepository'
import type { Customer } from '@/infra/database/schema'
import { ConflictError } from '@/shared/errors/AppError'

export class CreateCustomerUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(input: CreateCustomerInput): Promise<Customer> {
    const existing = await this.customerRepository.findByWhatsApp(
      input.whatsappNumber,
      input.establishmentId
    )
    if (existing) throw new ConflictError('Já existe um cliente com esse número de WhatsApp')
    return this.customerRepository.create(input)
  }
}
