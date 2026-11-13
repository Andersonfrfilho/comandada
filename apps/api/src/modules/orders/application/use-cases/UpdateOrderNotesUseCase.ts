import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

type UpdateOrderNotesParams = {
  readonly orderId: string
  readonly establishmentId: string
  readonly notes: string | null
}

export class UpdateOrderNotesUseCase {
  constructor(private readonly db: Database) {}

  async execute(params: UpdateOrderNotesParams) {
    const order = await this.db.query.orders.findFirst({
      where: and(
        eq(schema.orders.id, params.orderId),
        eq(schema.orders.establishmentId, params.establishmentId)
      ),
    })

    if (!order) throw new NotFoundError('Order')

    const [updated] = await this.db
      .update(schema.orders)
      .set({ notes: params.notes })
      .where(
        and(
          eq(schema.orders.id, params.orderId),
          eq(schema.orders.establishmentId, params.establishmentId)
        )
      )
      .returning()

    return updated!
  }
}
