import type { RouteHandler } from '@/infra/http/router'
import type { GetDashboardMetricsUseCase } from '../../application/use-cases/GetDashboardMetricsUseCase'
import { UnauthorizedError } from '@/shared/errors/AppError'

export class DashboardController {
  constructor(private readonly getMetricsUseCase: GetDashboardMetricsUseCase) {}

  metrics: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const metrics = await this.getMetricsUseCase.execute(request.user.establishmentId)
    response.json(metrics)
  }
}
