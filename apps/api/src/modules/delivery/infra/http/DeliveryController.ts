import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { GetDeliveryQueueUseCase } from '../../application/use-cases/GetDeliveryQueueUseCase'
import type { UpdateDeliveryStatusUseCase } from '../../application/use-cases/UpdateDeliveryStatusUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/infra/database/schema'
import { listCouriers, type AssignDelivererUseCase } from '../../application/use-cases/AssignDelivererUseCase'

type Database = NodePgDatabase<typeof schema>

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'dispatched', 'delivered', 'failed']),
  delivererId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
})

const assignSchema = z.object({ delivererId: z.string().uuid().nullable() })

export class DeliveryController {
  constructor(
    private readonly getDeliveryQueueUseCase: GetDeliveryQueueUseCase,
    private readonly updateStatusUseCase: UpdateDeliveryStatusUseCase,
    private readonly assignDelivererUseCase: AssignDelivererUseCase,
    private readonly db: Database
  ) {}

  couriers: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    response.json(await listCouriers(this.db, request.user.establishmentId))
  }

  assign: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = assignSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Escolha o entregador', parsed.error.flatten().fieldErrors)
    const delivery = await this.assignDelivererUseCase.execute({
      deliveryId: request.params['id']!,
      establishmentId: request.user.establishmentId,
      delivererId: parsed.data.delivererId,
    })
    response.json(delivery)
  }

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
      note: parsed.data.note,
    })
    response.json(delivery)
  }
}
