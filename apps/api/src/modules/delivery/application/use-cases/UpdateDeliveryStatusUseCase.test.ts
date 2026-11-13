import { describe, expect, it } from 'bun:test'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { UpdateDeliveryStatusUseCase } from './UpdateDeliveryStatusUseCase'

type Database = NodePgDatabase<typeof schema>

function fakeDatabase(deliveryStatus: string, orderStatus: string): Database {
  return {
    query: {
      deliveries: { findFirst: async () => ({ id: 'delivery-1', orderId: 'order-1', status: deliveryStatus }) },
      orders: { findFirst: async () => ({ status: orderStatus }) },
    },
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 'delivery-1' }] }) }) }),
  } as unknown as Database
}

const wsHub = { publishBroadcast: async () => undefined } as unknown as WebSocketHub

async function run(deliveryStatus: string, orderStatus: string, newStatus: 'dispatched' | 'delivered' | 'failed') {
  const calls: string[] = []
  const useCase = new UpdateDeliveryStatusUseCase(fakeDatabase(deliveryStatus, orderStatus), wsHub, {
    execute: async (input) => {
      calls.push(input.newStatus)
      return {} as never
    },
  })
  await useCase.execute({ deliveryId: 'delivery-1', establishmentId: 'establishment-1', newStatus, userId: 'user-1' })
  return calls
}

describe('UpdateDeliveryStatusUseCase', () => {
  it('"saiu" põe o pedido pronto em entrega', async () => {
    expect(await run('pending', 'ready', 'dispatched')).toEqual(['in_delivery'])
  })

  it('"entregue" conclui o pedido', async () => {
    expect(await run('dispatched', 'in_delivery', 'delivered')).toEqual(['completed'])
  })

  it('não pula etapa quando a cozinha ainda não terminou', async () => {
    expect(await run('pending', 'in_production', 'dispatched')).toEqual([])
  })

  it('falha na entrega não mexe no pedido', async () => {
    expect(await run('dispatched', 'in_delivery', 'failed')).toEqual([])
  })
})
