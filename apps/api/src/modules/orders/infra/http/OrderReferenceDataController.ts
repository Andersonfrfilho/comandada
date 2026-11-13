import type { RouteHandler } from '@/infra/http/router'
import type { ListPaymentTypesUseCase } from '../../application/use-cases/ListPaymentTypesUseCase'
import type { ListOrderTypesUseCase } from '../../application/use-cases/ListOrderTypesUseCase'
import { UnauthorizedError } from '@/shared/errors/AppError'

export class OrderReferenceDataController {
  constructor(
    private readonly listPaymentTypesUseCase: ListPaymentTypesUseCase,
    private readonly listOrderTypesUseCase: ListOrderTypesUseCase
  ) {}

  listPaymentTypes: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const paymentTypes = await this.listPaymentTypesUseCase.execute()
    response.json(paymentTypes)
  }

  listOrderTypes: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const orderTypes = await this.listOrderTypesUseCase.execute()
    response.json(orderTypes)
  }
}
