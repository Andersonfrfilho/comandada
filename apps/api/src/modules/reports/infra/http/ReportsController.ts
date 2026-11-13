import type { RouteHandler } from '@/infra/http/router'
import type { ExportOrdersCSVUseCase } from '../../application/use-cases/ExportOrdersCSVUseCase'
import type { GetMonthlyReportUseCase } from '../../application/use-cases/GetMonthlyReportUseCase'
import type { GetFunnelAnalysisUseCase } from '../../application/use-cases/GetFunnelAnalysisUseCase'
import type { GetTableMetricsUseCase } from '../../application/use-cases/GetTableMetricsUseCase'
import type { GetIngredientsRankingUseCase } from '../../application/use-cases/GetIngredientsRankingUseCase'
import type { GetProductProfitUseCase } from '../../application/use-cases/GetProductProfitUseCase'
import type { GetPreparationTimeComparisonUseCase } from '../../application/use-cases/GetPreparationTimeComparisonUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'

export class ReportsController {
  constructor(
    private readonly exportOrdersCSVUseCase: ExportOrdersCSVUseCase,
    private readonly getMonthlyReportUseCase: GetMonthlyReportUseCase,
    private readonly getFunnelAnalysisUseCase: GetFunnelAnalysisUseCase,
    private readonly getTableMetricsUseCase: GetTableMetricsUseCase,
    private readonly getIngredientsRankingUseCase: GetIngredientsRankingUseCase,
    private readonly getProductProfitUseCase: GetProductProfitUseCase,
    private readonly getPreparationTimeComparisonUseCase: GetPreparationTimeComparisonUseCase
  ) {}

  exportOrders: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const { from, to } = request.query
    if (!from || !to) {
      throw new ValidationError('Query params `from` and `to` are required')
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new ValidationError('Invalid date format. Use ISO 8601.')
    }

    const csv = await this.exportOrdersCSVUseCase.execute({
      establishmentId: request.user.establishmentId,
      from: fromDate,
      to: toDate,
    })

    const filename = `orders-${from}-${to}.csv`
    response.json({ csv, filename })
  }

  getMonthlyReport: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const { year, month } = request.query

    const yearNum = year ? parseInt(year) : new Date().getFullYear()
    const monthNum = month ? parseInt(month) : new Date().getMonth() + 1

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new ValidationError('Parâmetros year e month inválidos')
    }

    const report = await this.getMonthlyReportUseCase.execute({
      establishmentId: request.user.establishmentId,
      year: yearNum,
      month: monthNum,
    })

    response.json(report)
  }

  getFunnelAnalysis: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const { days } = request.query
    const daysNum = days ? parseInt(days) : 30

    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      throw new ValidationError('Parâmetro days inválido (1-365)')
    }

    const funnel = await this.getFunnelAnalysisUseCase.execute({
      establishmentId: request.user.establishmentId,
      days: daysNum,
    })

    response.json(funnel)
  }

  getTableMetrics: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const { days } = request.query
    const daysNum = days ? parseInt(days) : 30

    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      throw new ValidationError('Parâmetro days inválido (1-365)')
    }

    const metrics = await this.getTableMetricsUseCase.execute({
      establishmentId: request.user.establishmentId,
      days: daysNum,
    })

    response.json(metrics)
  }

  getIngredientsRanking: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const { days } = request.query
    const daysNum = days ? parseInt(days) : 30

    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      throw new ValidationError('Parâmetro days inválido (1-365)')
    }

    const ranking = await this.getIngredientsRankingUseCase.execute({
      establishmentId: request.user.establishmentId,
      days: daysNum,
    })

    response.json(ranking)
  }

  getProductProfit: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const { days } = request.query
    const daysNum = days ? parseInt(days) : 30

    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      throw new ValidationError('Parâmetro days inválido (1-365)')
    }

    const profit = await this.getProductProfitUseCase.execute({
      establishmentId: request.user.establishmentId,
      days: daysNum,
    })

    response.json(profit)
  }

  getPreparationTimeComparison: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const { days } = request.query
    const daysNum = days ? parseInt(days) : 30

    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      throw new ValidationError('Parâmetro days inválido (1-365)')
    }

    const comparison = await this.getPreparationTimeComparisonUseCase.execute({
      establishmentId: request.user.establishmentId,
      days: daysNum,
    })

    response.json(comparison)
  }
}
