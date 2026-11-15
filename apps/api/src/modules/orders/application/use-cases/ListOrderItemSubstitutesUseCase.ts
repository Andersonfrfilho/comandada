import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import { OrderSubstituteCatalog } from '../services/OrderSubstituteCatalog'

type Database = NodePgDatabase<typeof schema>

export interface ItemSubstitutes {
  readonly itemId: string
  readonly substitutes: ReadonlyArray<{
    readonly productId: string
    readonly productName: string
    readonly unitPrice: number
    readonly catalogName: string | null
  }>
}

/** Para cada item do pedido, os produtos do mesmo tipo que a equipe pode oferecer se ele faltar. */
export class ListOrderItemSubstitutesUseCase {
  constructor(private readonly db: Database) {}

  async execute(orderId: string, establishmentId: string): Promise<{ items: ItemSubstitutes[] }> {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderId), eq(schema.orders.establishmentId, establishmentId)),
      with: { items: true },
    })
    if (!order) throw new NotFoundError('Order')

    const catalog = await OrderSubstituteCatalog.load(this.db, establishmentId)
    // Produto que já está no pedido não é sugestão útil: o cliente já pediu.
    const inOrder = new Set(order.items.map((item) => item.productId).filter((id): id is string => Boolean(id)))
    return {
      items: order.items.map((item) => ({
        itemId: item.id,
        substitutes: catalog.substitutesFor(item, inOrder).map((candidate) => ({
          productId: candidate.productId,
          productName: candidate.productName,
          unitPrice: candidate.unitPrice,
          catalogName: candidate.catalogName,
        })),
      })),
    }
  }
}
