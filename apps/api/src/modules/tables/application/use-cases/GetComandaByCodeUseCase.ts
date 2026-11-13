import type { ComandaRepository, ComandaWithTable } from '../../domain/repositories/ComandaRepository'
import { NotFoundError } from '@/shared/errors/AppError'

export class GetComandaByCodeUseCase {
  constructor(private readonly comandaRepository: ComandaRepository) {}

  async execute(code: string): Promise<ComandaWithTable> {
    const comanda = await this.comandaRepository.findByCodePublic(code)
    if (!comanda) throw new NotFoundError('Comanda não encontrada ou já encerrada')
    return comanda
  }
}
