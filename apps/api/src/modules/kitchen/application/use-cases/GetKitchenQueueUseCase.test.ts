import { describe, expect, it } from 'bun:test'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/infra/database/schema'
import { GetKitchenQueueUseCase } from './GetKitchenQueueUseCase'

type Database = NodePgDatabase<typeof schema>

const minutes = (value: number) => new Date(Date.now() + value * 60000)

function fakeDatabase(rows: Array<Record<string, unknown>>): Database {
  return { query: { orders: { findMany: async () => rows } } } as unknown as Database
}

describe('GetKitchenQueueUseCase', () => {
  it('segura a encomenda até perto da hora marcada', async () => {
    const queue = await new GetKitchenQueueUseCase(fakeDatabase([
      { id: 'now', status: 'received', type: 'pickup', receivedAt: minutes(-5), scheduledFor: null, items: [] },
      { id: 'tonight', status: 'received', type: 'pickup', receivedAt: minutes(-30), scheduledFor: minutes(180), items: [] },
      { id: 'soon', status: 'received', type: 'delivery', receivedAt: minutes(-120), scheduledFor: minutes(50), items: [] },
    ])).execute('establishment-1')

    // Ordem de entrada na fila: a encomenda liberou há 10 min, antes do pedido de 5 min atrás.
    expect(queue.map((order) => order.id)).toEqual(['soon', 'now'])
    // "soon" entrou na fila há 10 min (60 min antes da entrega marcada), não há 2 h.
    expect(queue.find((order) => order.id === 'soon')?.ageMinutes).toBe(10)
  })
})
