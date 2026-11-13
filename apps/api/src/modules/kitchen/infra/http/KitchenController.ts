import type { RouteHandler } from '@/infra/http/router'
import type { GetKitchenQueueUseCase } from '../../application/use-cases/GetKitchenQueueUseCase'
import type { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import type { MarkOrderItemReadyUseCase } from '../../application/use-cases/MarkOrderItemReadyUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import { z } from 'zod'

const advanceSchema = z.object({
  status: z.enum(['in_production', 'ready']),
})

export class KitchenController {
  constructor(
    private readonly getKitchenQueueUseCase: GetKitchenQueueUseCase,
    private readonly updateStatusUseCase: UpdateOrderStatusUseCase,
    private readonly markItemReadyUseCase: MarkOrderItemReadyUseCase
  ) {}

  queue: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const orders = await this.getKitchenQueueUseCase.execute(request.user.establishmentId)
    response.json(orders)
  }

  advance: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = advanceSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const order = await this.updateStatusUseCase.execute({
      orderId: request.params['id']!,
      establishmentId: request.user.establishmentId,
      newStatus: parsed.data.status,
      // Sem o usuário, o aviso de status ao cliente do WhatsApp não sai.
      userId: request.user.id,
    })
    response.json(order)
  }

  markItemReady: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const result = await this.markItemReadyUseCase.execute({
      orderId: request.params['id']!,
      itemId: request.params['itemId']!,
      establishmentId: request.user.establishmentId,
      userId: request.user.id,
    })
    response.json(result)
  }
}
