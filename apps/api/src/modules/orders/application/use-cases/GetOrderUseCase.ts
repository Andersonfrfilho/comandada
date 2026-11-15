import { eq, and, asc, desc, ne } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import { PARTIAL_CONFIRMATION_STATUS } from '../../shared/orders.constant'

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

    // Última pergunta de itens em falta: o painel mostra "aguardando o cliente" até a resposta chegar.
    const [partialConfirmation] = await this.db
      .select({
        id: schema.orderPartialConfirmations.id,
        status: schema.orderPartialConfirmations.status,
        unavailableItemIds: schema.orderPartialConfirmations.unavailableItemIds,
        substitutions: schema.orderPartialConfirmations.substitutions,
        createdAt: schema.orderPartialConfirmations.createdAt,
        answeredAt: schema.orderPartialConfirmations.answeredAt,
      })
      .from(schema.orderPartialConfirmations)
      .where(
        and(
          eq(schema.orderPartialConfirmations.orderId, order.id),
          ne(schema.orderPartialConfirmations.status, PARTIAL_CONFIRMATION_STATUS.SUPERSEDED)
        )
      )
      .orderBy(desc(schema.orderPartialConfirmations.createdAt))
      .limit(1)

    return { ...order, partialConfirmation: partialConfirmation ?? null }
  }
}
