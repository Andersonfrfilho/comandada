import type { ComandaRepository } from '../../domain/repositories/ComandaRepository'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError } from '@/shared/errors/AppError'
import type { Comanda } from '@/infra/database/schema'

type BroadcastHub = Pick<WebSocketHub, 'publishBroadcast'>

/**
 * Garçom pede a conta da comanda pelo celular: a mesa mostra "Conta pedida" e o caixa é avisado.
 * `requested: false` desfaz (cliente pediu mais alguma coisa).
 */
export class RequestComandaBillUseCase {
  constructor(
    private readonly comandaRepository: ComandaRepository,
    private readonly wsHub: BroadcastHub
  ) {}

  async execute(input: { comandaId: string; establishmentId: string; requested: boolean }): Promise<Comanda> {
    const comanda = await this.comandaRepository.findById(input.comandaId, input.establishmentId)
    if (!comanda || comanda.status !== 'open') throw new NotFoundError('Comanda aberta')

    const updated = await this.comandaRepository.setBillRequested(
      input.comandaId,
      input.establishmentId,
      input.requested ? new Date() : null
    )
    if (!updated) throw new NotFoundError('Comanda aberta')

    if (input.requested) {
      await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.COMANDA_BILL_REQUESTED, {
        comandaId: comanda.id,
        code: comanda.code,
        tableId: comanda.tableId,
        tableNumber: comanda.tableNumber,
        customerName: comanda.customerName,
      })
    }
    return updated
  }
}
