import { z } from 'zod'

import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { GetAgendaDayUseCase } from '../../application/use-cases/GetAgendaDayUseCase'
import { toLocalDate } from '../../shared/agendaTime'

const agendaQuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })

export class AgendaController {
  constructor(private readonly getAgendaDayUseCase: GetAgendaDayUseCase) {}

  day: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = agendaQuerySchema.safeParse(request.query)
    if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    const agenda = await this.getAgendaDayUseCase.execute({
      establishmentId: request.user.establishmentId,
      date: parsed.data.date ?? toLocalDate(new Date()),
    })
    response.json({ data: agenda })
  }
}
