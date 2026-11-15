import { describe, expect, it } from 'bun:test'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/infra/database/schema'
import { GetKitchenQueueUseCase, type KitchenTimeProfileSource } from './GetKitchenQueueUseCase'

type Database = NodePgDatabase<typeof schema>

const minutes = (value: number) => new Date(Date.now() + value * 60000)

function fakeDatabase(rows: Array<Record<string, unknown>>): Database {
  return { query: { orders: { findMany: async () => rows } } } as unknown as Database
}

const profileSource: KitchenTimeProfileSource = {
  loadKitchenTimeProfile: async () => ({
    productMinutes: new Map([['sushi', 25]]),
    defaultPreparationMinutes: 25,
    deliveryMinutes: 20,
  }),
}

describe('GetKitchenQueueUseCase', () => {
  it('segura a encomenda até perto da hora marcada', async () => {
    const queue = await new GetKitchenQueueUseCase(fakeDatabase([
      { id: 'now', status: 'received', type: 'pickup', receivedAt: minutes(-5), scheduledFor: null, estimatedAt: null, items: [] },
      { id: 'tonight', status: 'received', type: 'pickup', receivedAt: minutes(-30), scheduledFor: minutes(180), estimatedAt: null, items: [] },
      { id: 'soon', status: 'received', type: 'delivery', receivedAt: minutes(-120), scheduledFor: minutes(50), estimatedAt: null, items: [] },
    ]), profileSource).execute('establishment-1')

    // "tonight" ainda não entrou. "now" precisava ter começado há 5 min; "soon" pode começar daqui a 5.
    expect(queue.map((order) => order.id)).toEqual(['now', 'soon'])
    // "soon" entrou na fila há 10 min (60 min antes da entrega marcada), não há 2 h.
    const soon = queue.find((order) => order.id === 'soon')
    expect(soon?.ageMinutes).toBe(10)
    expect(Math.round((Date.now() - new Date(soon?.waitingSince ?? 0).getTime()) / 60000)).toBe(10)
    expect(queue[0]?.priority.doNow).toBe(true)
  })

  it('pede os tempos só dos produtos que estão na fila', async () => {
    let requested: readonly string[] = []
    await new GetKitchenQueueUseCase(fakeDatabase([
      { id: 'a', status: 'received', type: 'table', receivedAt: minutes(-1), scheduledFor: null, estimatedAt: null, items: [{ productId: 'sushi', readyAt: null }, { productId: 'sushi', readyAt: null }, { productId: null, readyAt: null }] },
    ]), {
      loadKitchenTimeProfile: async (_establishmentId, productIds) => {
        requested = productIds
        return { productMinutes: new Map(), defaultPreparationMinutes: 25, deliveryMinutes: 20 }
      },
    }).execute('establishment-1')
    expect(requested).toEqual(['sushi'])
  })
})
