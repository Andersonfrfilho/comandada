import { inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { OrderStatus } from '@/shared/types'
import type { NotifyOrderStatusUseCase } from './NotifyOrderStatusUseCase'

type Database = NodePgDatabase<typeof schema>

export interface SyncedRowChange {
  readonly table_name: string
  readonly op: 'I' | 'U' | 'D'
  readonly data: Record<string, unknown> | null
}

const STATUS_LOG_TABLE = 'public.order_status_logs'

/**
 * A loja muda o status do pedido mesmo sem internet, mas o WhatsApp só sai da nuvem. Quando o
 * histórico de status chega pela sincronização, a nuvem avisa o cliente do mesmo jeito que avisaria
 * se a mudança tivesse sido feita nela. Só o status em que o pedido está agora é avisado: depois de
 * horas offline, o cliente recebe "saiu para entrega", não toda a sequência atrasada.
 */
export class NotifySyncedOrderStatusUseCase {
  constructor(
    private readonly db: Database,
    private readonly notifyCustomer: Pick<NotifyOrderStatusUseCase, 'execute'>
  ) {}

  async execute(changes: readonly SyncedRowChange[]): Promise<number> {
    const latestByOrder = new Map<string, { status: string; establishmentId: string; userId: string }>()
    for (const change of changes) {
      if (change.table_name !== STATUS_LOG_TABLE || change.op !== 'I' || !change.data) continue
      const orderId = stringField(change.data, 'order_id')
      const status = stringField(change.data, 'status')
      const establishmentId = stringField(change.data, 'establishment_id')
      const userId = stringField(change.data, 'changed_by_user_id')
      // Igual à mudança feita no painel da nuvem: só avisa quando alguém da equipe mudou o status.
      if (!orderId || !status || !establishmentId || !userId) continue
      latestByOrder.set(orderId, { status, establishmentId, userId })
    }
    if (latestByOrder.size === 0) return 0

    const orders = await this.db.query.orders.findMany({
      where: inArray(schema.orders.id, [...latestByOrder.keys()]),
      columns: { id: true, status: true },
    })

    let notified = 0
    for (const order of orders) {
      const change = latestByOrder.get(order.id)
      if (!change || change.status !== order.status) continue
      await this.notifyCustomer
        .execute({
          orderId: order.id,
          establishmentId: change.establishmentId,
          newStatus: order.status as OrderStatus,
          agentUserId: change.userId,
        })
        .then(() => {
          notified += 1
        })
        .catch((error: unknown) =>
          console.error('[Orders] synced status notification failed', error instanceof Error ? error.message : error)
        )
    }
    return notified
  }
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
