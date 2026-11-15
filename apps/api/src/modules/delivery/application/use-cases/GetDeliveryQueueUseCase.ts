import { eq, and, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

export class GetDeliveryQueueUseCase {
  constructor(private readonly db: Database) {}

  async execute(establishmentId: string) {
    const rows = await this.db.query.deliveries.findMany({
      where: and(
        eq(schema.deliveries.establishmentId, establishmentId),
        inArray(schema.deliveries.status, ['pending', 'dispatched'])
      ),
      // Entregador precisa de quem recebe, como cobrar e o troco, além do endereço.
      with: { order: { with: { items: true, customer: true, payments: true } }, deliverer: true },
    })

    // Pedido cancelado ou concluído não fica na fila (antes o entregador ainda conseguia "entregar").
    return rows
      .filter((delivery) => !['cancelled', 'completed'].includes(delivery.order.status))
      .map((delivery) => ({
      ...delivery,
      order: {
        ...delivery.order,
        customer: delivery.order.customer
          ? { name: delivery.order.customer.name, whatsappNumber: delivery.order.customer.whatsappNumber }
          : null,
      },
      deliverer: delivery.deliverer
        ? { id: delivery.deliverer.id, name: delivery.deliverer.name }
        : null,
    }))
  }
}
