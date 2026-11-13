import { db } from '../connection'
import * as schema from '../schema'
import { faker } from './helpers/seed-helpers'
import type { SeededOrder } from './orders.seed'

function deliveryId(index: number): string {
  return `00000000-0000-0000-0009-${String(index).padStart(12, '0')}`
}

const DELIVERY_STATUS_BY_ORDER_STATUS: Record<string, 'delivered' | 'dispatched' | 'failed' | 'pending'> = {
  completed: 'delivered',
  in_delivery: 'dispatched',
  cancelled: 'failed',
}

type SeedDeliveriesParams = {
  establishmentId: string
  delivererUserId: string
  orders: SeededOrder[]
}

export async function seedDeliveries({ establishmentId, delivererUserId, orders }: SeedDeliveriesParams): Promise<void> {
  const deliveryOrders = orders.filter((order) => order.type === 'delivery')

  const deliveries = deliveryOrders.map((order, index) => {
    const status = DELIVERY_STATUS_BY_ORDER_STATUS[order.status] ?? 'pending'
    return {
      id: deliveryId(index),
      orderId: order.id,
      establishmentId,
      delivererId: delivererUserId,
      status,
      addressSnapshot: {
        street: faker.location.street(),
        number: faker.location.buildingNumber(),
        neighborhood: faker.location.county(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        zip: faker.location.zipCode('#####-###'),
      },
      dispatchedAt: status === 'dispatched' || status === 'delivered' ? new Date() : null,
      deliveredAt: status === 'delivered' ? new Date() : null,
      failedAt: status === 'failed' ? new Date() : null,
    }
  })

  if (deliveries.length === 0) return
  await db.insert(schema.deliveries).values(deliveries).onConflictDoNothing()
}
