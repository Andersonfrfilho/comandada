import type { CustomerRepository, CustomerWithStats, CustomerSortField, SortDirection } from '../../domain/repositories/CustomerRepository'

interface ListCustomersInput {
  establishmentId: string
  page?: number
  pageSize?: number
  search?: string
  sortBy?: CustomerSortField
  sortDirection?: SortDirection
}

interface ListCustomersOutput {
  data: CustomerWithStats[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export class ListCustomersUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(input: ListCustomersInput): Promise<ListCustomersOutput> {
    return this.customerRepository.listByEstablishment(input)
  }
}
