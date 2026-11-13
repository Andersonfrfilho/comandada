import type { BotConfigRepository, OrderTypeRow } from '@/infra/database/BotConfigRepository'

export class ListOrderTypesUseCase {
  constructor(private readonly botConfigRepository: BotConfigRepository) {}

  async execute(): Promise<OrderTypeRow[]> {
    return this.botConfigRepository.listActiveOrderTypes()
  }
}
