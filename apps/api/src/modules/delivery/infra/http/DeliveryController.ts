import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { GetDeliveryQueueUseCase } from '../../application/use-cases/GetDeliveryQueueUseCase'
import type { UpdateDeliveryStatusUseCase } from '../../application/use-cases/UpdateDeliveryStatusUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'dispatched', 'delivered', 'failed']),
  delivererId: z.string().uuid().optional(),
})

export class DeliveryController {
  constructor(
    private readonly getDeliveryQueueUseCase: GetDeliveryQueueUseCase,
    private readonly updateStatusUseCase: UpdateDeliveryStatusUseCase
  ) {}

  queue: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const deliveries = await this.getDeliveryQueueUseCase.execute(request.user.establishmentId)
    response.json(deliveries)
  }

  updateStatus: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = updateStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const delivery = await this.updateStatusUseCase.execute({
      deliveryId: request.params['id']!,
      establishmentId: request.user.establishmentId,
      newStatus: parsed.data.status,
      delivererId: parsed.data.delivererId,
      userId: request.user.id,
    })
    response.json(delivery)
  }
}
