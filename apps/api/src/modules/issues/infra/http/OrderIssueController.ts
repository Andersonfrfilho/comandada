import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { GetOrderIssueReportUseCase } from '../../application/use-cases/GetOrderIssueReportUseCase'
import type { ResolveOrderIssueUseCase } from '../../application/use-cases/ResolveOrderIssueUseCase'

const reportQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })

export class OrderIssueController {
  constructor(
    private readonly getReportUseCase: GetOrderIssueReportUseCase,
    private readonly resolveUseCase: ResolveOrderIssueUseCase
  ) {}

  report: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = reportQuerySchema.safeParse(request.query)
    if (!parsed.success) throw new ValidationError('Parâmetro days inválido (1-365)', parsed.error.flatten().fieldErrors)
    response.json(await this.getReportUseCase.execute({ establishmentId: request.user.establishmentId, days: parsed.data.days }))
  }

  resolve: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const issueId = z.string().uuid().safeParse(request.params['id'])
    if (!issueId.success) throw new ValidationError('id inválido')
    response.json(
      await this.resolveUseCase.execute({
        issueId: issueId.data,
        establishmentId: request.user.establishmentId,
        userId: request.user.id,
      })
    )
  }
}
