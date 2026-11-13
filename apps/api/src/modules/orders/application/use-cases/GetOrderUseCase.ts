import { eq, and, asc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

export class GetOrderUseCase {
  constructor(private readonly db: Database) {}

  async execute(orderId: string, establishmentId: string) {
    const order = await this.db.query.orders.findFirst({
      where: and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.establishmentId, establishmentId)
      ),
      // O cliente vem junto porque a tela de detalhe abre a conversa a partir do WhatsApp dele.
      with: {
        items: true,
        customer: true,
        payments: true,
        delivery: true,
        fiscalDocument: true,
        statusLogs: { orderBy: (log) => [asc(log.createdAt)] },
      },
    })

    if (!order) throw new NotFoundError('Order')
    return order
  }
}
