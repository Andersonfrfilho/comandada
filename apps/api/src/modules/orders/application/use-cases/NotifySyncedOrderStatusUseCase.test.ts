import { describe, expect, it } from 'bun:test'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/infra/database/schema'
import { NotifySyncedOrderStatusUseCase } from './NotifySyncedOrderStatusUseCase'

type Database = NodePgDatabase<typeof schema>

const log = (orderId: string, status: string, userId: string | null = 'user-1') => ({
  table_name: 'public.order_status_logs',
  op: 'I' as const,
  data: { order_id: orderId, status, establishment_id: 'establishment-1', changed_by_user_id: userId },
})

describe('NotifySyncedOrderStatusUseCase', () => {
  it('avisa só o status atual de cada pedido que veio da loja', async () => {
    const database = {
      query: {
        orders: {
          findMany: async () => [
            { id: 'order-1', status: 'in_delivery' },
            { id: 'order-2', status: 'completed' },
          ],
        },
      },
    } as unknown as Database
    const sent: string[] = []
    const useCase = new NotifySyncedOrderStatusUseCase(database, {
      execute: async (params) => {
        sent.push(`${params.orderId}:${params.newStatus}`)
      },
    })

    const notified = await useCase.execute([
      log('order-1', 'in_production'),
      log('order-1', 'ready'),
      log('order-1', 'in_delivery'),
      // Já andou para "completed" na loja: o "ready" atrasado não é mandado.
      log('order-2', 'ready'),
      // Mudança automática, sem ninguém da equipe: não avisa (igual ao painel da nuvem).
      log('order-3', 'in_production', null),
      { table_name: 'public.orders', op: 'U' as const, data: { id: 'order-1' } },
    ])

    expect(sent).toEqual(['order-1:in_delivery'])
    expect(notified).toBe(1)
  })
})
