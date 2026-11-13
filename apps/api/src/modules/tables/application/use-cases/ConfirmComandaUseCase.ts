import type { ComandaRepository, ComandaWithTable } from '../../domain/repositories/ComandaRepository'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'

export interface ConfirmComandaInput {
  customerName: string
  customerPhone: string
  customerDocument?: string | undefined
}

export class ConfirmComandaUseCase {
  constructor(private readonly comandaRepository: ComandaRepository) {}

  async execute(code: string, input: ConfirmComandaInput): Promise<ComandaWithTable> {
    const comanda = await this.comandaRepository.findByCodePublic(code)
    if (!comanda) throw new NotFoundError('Comanda não encontrada ou já encerrada')

    if (comanda.customerName) {
      throw new UnprocessableError('Esta comanda já possui dados confirmados')
    }

    const updated = await this.comandaRepository.confirm(comanda.id, {
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      ...(input.customerDocument !== undefined && { customerDocument: input.customerDocument }),
    })

    return { ...updated, tableNumber: comanda.tableNumber, tableCapacity: comanda.tableCapacity }
  }
}
