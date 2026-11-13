import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { ComandaRepository } from '../../domain/repositories/ComandaRepository'
import type { Comanda } from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export class OpenComandaUseCase {
  constructor(
    private readonly tableRepository: TableRepository,
    private readonly comandaRepository: ComandaRepository
  ) {}

  async execute(tableId: string, establishmentId: string): Promise<Comanda> {
    const table = await this.tableRepository.findById(tableId, establishmentId)
    if (!table) throw new NotFoundError('Mesa')

    // Uma mesa pode ter N comandas abertas ao mesmo tempo (uma por cliente).
    let code: string
    let attempts = 0
    do {
      code = generateCode()
      attempts++
      if (attempts > 20) throw new Error('Não foi possível gerar um código único — tente novamente')
    } while (await this.comandaRepository.isCodeActiveInEstablishment(code, establishmentId))

    const comanda = await this.comandaRepository.create({ establishmentId, tableId, code })

    await this.tableRepository.updateStatus(tableId, establishmentId, 'occupied')

    return comanda
  }
}
