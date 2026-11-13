import { describe, expect, it } from 'bun:test'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/infra/database/schema'
import { MarkOrderItemReadyUseCase } from './MarkOrderItemReadyUseCase'

type Database = NodePgDatabase<typeof schema>

// Último item pendente: depois de marcá-lo, não sobra nenhum item sem `readyAt`.
function fakeDatabase(status: string): Database {
  const where = () => ({ limit: async () => [] })
  return {
    query: {
      orders: {
        findFirst: async () => ({
          id: 'order-1',
          status,
          items: [{ id: 'item-1', readyAt: null, productionStartedAt: null }],
        }),
      },
    },
    update: () => ({ set: () => ({ where: async () => [] }) }),
    select: () => ({ from: () => ({ where }) }),
  } as unknown as Database
}

describe('MarkOrderItemReadyUseCase', () => {
  it('passa o usuário da cozinha adiante, para o cliente do WhatsApp ser avisado', async () => {
    const calls: Array<{ newStatus: string; userId?: string | undefined }> = []
    const useCase = new MarkOrderItemReadyUseCase(fakeDatabase('received'), {
      execute: async (input) => {
        calls.push({ newStatus: input.newStatus, userId: input.userId })
        return {} as never
      },
    })

    const result = await useCase.execute({
      orderId: 'order-1',
      itemId: 'item-1',
      establishmentId: 'establishment-1',
      userId: 'user-1',
    })

    expect(result.orderReady).toBe(true)
    expect(calls).toEqual([
      { newStatus: 'in_production', userId: 'user-1' },
      { newStatus: 'ready', userId: 'user-1' },
    ])
  })
})
