import type { ReserveTableUseCase } from '@/modules/agenda/application/use-cases/ReserveTableUseCase'
import { fromLocalDateTime } from '@/modules/agenda/shared/agendaTime'
import type { BotCustomerService } from '../services/BotCustomerService'

export interface CreateBotReservationParams {
  readonly establishmentId: string
  readonly whatsappNumber: string
  readonly customerName?: string | undefined
  readonly code: string
  readonly date: string
  readonly time: string
  readonly partySize: number
}

export interface CreateBotReservationResult {
  readonly id: string
  readonly code: string
  readonly tableNumber: number
}

// The table is chosen here, not in the bot: only the agenda knows which tables are still free.
export class CreateBotReservationUseCase {
  constructor(
    private readonly customerService: BotCustomerService,
    private readonly reserveTable: Pick<ReserveTableUseCase, 'execute'>
  ) {}

  async execute(params: CreateBotReservationParams): Promise<CreateBotReservationResult> {
    const customer = await this.customerService.findOrCreate({
      establishmentId: params.establishmentId,
      whatsappNumber: params.whatsappNumber,
      name: params.customerName,
    })
    const reservation = await this.reserveTable.execute({
      establishmentId: params.establishmentId,
      customerId: customer.id,
      code: params.code,
      startsAt: fromLocalDateTime(params.date, params.time),
      partySize: params.partySize,
      now: new Date(),
    })
    return { id: reservation.id, code: reservation.code, tableNumber: reservation.tableNumber }
  }
}
