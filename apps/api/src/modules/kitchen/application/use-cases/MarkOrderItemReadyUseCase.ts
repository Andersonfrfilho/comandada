import { eq, and, isNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import type { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'

type Database = NodePgDatabase<typeof schema>

interface MarkOrderItemReadyInput {
  orderId: string
  itemId: string
  establishmentId: string
  // Repassado para a mudança de status: é ele que libera o aviso "pronto" ao cliente do WhatsApp.
  userId?: string | undefined
}

/**
 * A cozinha entrega item a item: a bebida sai em um minuto e o prato em vinte.
 * Marcar cada item no momento em que fica pronto é o que permite ao relatório
 * de tempo de preparo comparar o cadastrado com o real por produto. O pedido só
 * avança para `ready` quando o último item é marcado.
 */
export class MarkOrderItemReadyUseCase {
  constructor(
    private readonly db: Database,
    private readonly updateOrderStatus: Pick<UpdateOrderStatusUseCase, 'execute'>
  ) {}

  async execute(input: MarkOrderItemReadyInput): Promise<{ itemId: string; readyAt: Date; orderReady: boolean }> {
    const order = await this.db.query.orders.findFirst({
      where: and(
        eq(schema.orders.id, input.orderId),
        eq(schema.orders.establishmentId, input.establishmentId)
      ),
      with: { items: true },
    })

    if (!order) throw new NotFoundError('Order')

    const item = order.items.find((candidate) => candidate.id === input.itemId)
    if (!item) throw new NotFoundError('OrderItem')

    if (order.status !== 'received' && order.status !== 'in_production') {
      throw new UnprocessableError('Pedido não está mais na fila da cozinha')
    }

    const now = new Date()

    if (!item.readyAt) {
      await this.db
        .update(schema.orderItems)
        .set({ readyAt: now, productionStartedAt: item.productionStartedAt ?? now })
        .where(eq(schema.orderItems.id, input.itemId))
    }

    const [pending] = await this.db
      .select({ id: schema.orderItems.id })
      .from(schema.orderItems)
      .where(and(eq(schema.orderItems.orderId, input.orderId), isNull(schema.orderItems.readyAt)))
      .limit(1)

    const orderReady = pending === undefined
    if (orderReady) {
      if (order.status === 'received') {
        await this.updateOrderStatus.execute({
          orderId: input.orderId,
          establishmentId: input.establishmentId,
          newStatus: 'in_production',
          userId: input.userId,
        })
      }
      await this.updateOrderStatus.execute({
        orderId: input.orderId,
        establishmentId: input.establishmentId,
        newStatus: 'ready',
        userId: input.userId,
      })
    }

    return { itemId: input.itemId, readyAt: item.readyAt ?? now, orderReady }
  }
}
