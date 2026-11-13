import type { BotConfigRepository, PaymentTypeRow } from '@/infra/database/BotConfigRepository'

export class ListPaymentTypesUseCase {
  constructor(private readonly botConfigRepository: BotConfigRepository) {}

  async execute(): Promise<PaymentTypeRow[]> {
    return this.botConfigRepository.listActivePaymentTypes()
  }
}
