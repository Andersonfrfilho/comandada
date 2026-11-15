import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'

type Database = NodePgDatabase<typeof schema>

export interface Courier {
  id: string
  name: string
}

/** Quem pode levar pedido: funcionário ativo cujo cargo mexe em entregas (`delivery:write`). */
export async function listCouriers(db: Database, establishmentId: string): Promise<Courier[]> {
  const rows = await db
    .selectDistinct({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .innerJoin(schema.permissions, eq(schema.permissions.roleId, schema.users.roleId))
    .where(
      and(
        eq(schema.users.establishmentId, establishmentId),
        eq(schema.users.active, true),
        eq(schema.permissions.resource, 'delivery'),
        eq(schema.permissions.action, 'write')
      )
    )
  return rows.sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'))
}

export class AssignDelivererUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub: WebSocketHub
  ) {}

  async execute(input: { deliveryId: string; establishmentId: string; delivererId: string | null }) {
    const delivery = await this.db.query.deliveries.findFirst({
      where: and(eq(schema.deliveries.id, input.deliveryId), eq(schema.deliveries.establishmentId, input.establishmentId)),
    })
    if (!delivery) throw new NotFoundError('entrega')
    if (!['pending', 'dispatched'].includes(delivery.status)) {
      throw new UnprocessableError(MessagesConstants.delivery.invalidTransition)
    }

    if (input.delivererId) {
      const couriers = await listCouriers(this.db, input.establishmentId)
      if (!couriers.some((courier) => courier.id === input.delivererId)) {
        throw new UnprocessableError(MessagesConstants.delivery.courierNotFound)
      }
    }

    const [updated] = await this.db
      .update(schema.deliveries)
      .set({ delivererId: input.delivererId })
      .where(
        and(
          eq(schema.deliveries.id, input.deliveryId),
          inArray(schema.deliveries.status, ['pending', 'dispatched'])
        )
      )
      .returning()

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.DELIVERY_ASSIGNED, {
      deliveryId: input.deliveryId,
      delivererId: input.delivererId,
    })
    return updated
  }
}
