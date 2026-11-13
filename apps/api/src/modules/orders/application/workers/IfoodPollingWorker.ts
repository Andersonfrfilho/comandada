import { Worker, type ConnectionOptions } from 'bullmq'
import { eq, and, ilike } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { queueConnection } from '@/infra/queue/redisConnection'
import { IFOOD_POLLING_QUEUE, IFOOD_POLLING_JOB } from '@/infra/queue/QueueNames.constant'
import { IfoodProvider } from '@/shared/providers/IfoodProvider'
import type { CreateOrderUseCase } from '../../application/use-cases/CreateOrderUseCase'
import type { UpdateOrderStatusUseCase } from '../../application/use-cases/UpdateOrderStatusUseCase'
import { scheduleIfoodPolling } from './IfoodPollingScheduler'
import type { OrderChannel } from '@/shared/types'

type Database = NodePgDatabase<typeof schema>

const processedIfoodOrders = new Set<string>()

export function startIfoodWorker(
  database: Database,
  createOrderUseCase: CreateOrderUseCase,
  updateOrderStatusUseCase: UpdateOrderStatusUseCase
): Worker {
  const clientId = process.env.IFOOD_CLIENT_ID
  const clientSecret = process.env.IFOOD_CLIENT_SECRET
  const merchantId = process.env.IFOOD_MERCHANT_ID
  const establishmentId = process.env.IFOOD_ESTABLISHMENT_ID

  if (!clientId || !clientSecret || !merchantId || !establishmentId) {
    throw new Error('[IfoodWorker] Missing required IFOOD_* environment variables')
  }

  const provider = new IfoodProvider({ clientId, clientSecret, merchantId })

  const worker = new Worker(
    IFOOD_POLLING_QUEUE,
    async (job) => {
      if (job.name === IFOOD_POLLING_JOB.POLL) {
        await pollAndProcessOrders(database, provider, createOrderUseCase, updateOrderStatusUseCase, establishmentId)
      }
    },
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 1 }
  )

  void scheduleIfoodPolling()

  worker.on('failed', (job, err) => {
    console.error('[IfoodWorker] job failed', job?.id, err?.message)
  })

  worker.on('error', (err) => console.error('[IfoodWorker] error', err.message))

  return worker
}

async function pollAndProcessOrders(
  database: Database,
  provider: IfoodProvider,
  createOrderUseCase: CreateOrderUseCase,
  updateOrderStatusUseCase: UpdateOrderStatusUseCase,
  establishmentId: string
): Promise<void> {
  console.log('[IfoodWorker] Polling for new orders...')

  const events = await provider.pollEvents()

  if (events.length === 0) {
    console.log('[IfoodWorker] No new events')
    return
  }

  for (const event of events) {
    if (processedIfoodOrders.has(event.id)) continue

    await provider.acknowledgeEvent(event.id)

    if (event.code !== 'PLACED') continue

    const ifoodOrder = await provider.getOrder(event.id)
    if (!ifoodOrder) {
      console.warn(`[IfoodWorker] Could not fetch order ${event.id}, skipping`)
      continue
    }

    try {
      const customerId = await findOrCreateCustomer(database, establishmentId, ifoodOrder.customer)
      const orderItems = await mapItemsToOrderInput(database, establishmentId, ifoodOrder.items)
      const channel: OrderChannel = 'ifood'

      const order = await createOrderUseCase.execute({
        establishmentId,
        ...(customerId ? { customerId } : {}),
        channel,
        type: 'delivery',
        items: orderItems,
        notes: JSON.stringify({
          ifoodOrderId: ifoodOrder.id,
          ifoodDisplayId: ifoodOrder.displayId,
          paymentMethod: ifoodOrder.paymentMethod,
          deliveryAddress: ifoodOrder.deliveryAddress ?? null,
        }),
        fiscalEnabled: true,
        whatsappMessageId: `ifood:${ifoodOrder.id}`,
      })

      console.log(`[IfoodWorker] Created order ${order.id} from iFood order ${ifoodOrder.id}`)
      processedIfoodOrders.add(event.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[IfoodWorker] Failed to create order from iFood order ${ifoodOrder.id}: ${message}`)
    }
  }
}

async function findOrCreateCustomer(
  database: Database,
  establishmentId: string,
  customer: { name: string; phone: string }
): Promise<string | undefined> {
  if (!customer.phone) return undefined

  const existing = await database.query.customers.findFirst({
    where: and(
      eq(schema.customers.establishmentId, establishmentId),
      eq(schema.customers.phone, customer.phone)
    ),
  })

  if (existing) return existing.id

  const [created] = await database
    .insert(schema.customers)
    .values({
      establishmentId,
      name: customer.name || 'Cliente iFood',
      whatsappNumber: customer.phone,
      phone: customer.phone,
    })
    .returning()

  if (!created) return undefined
  console.log(`[IfoodWorker] Created customer ${created.id} for phone ${customer.phone}`)
  return created.id
}

interface OrderItemInput {
  productId?: string
  productName: string
  unitPrice: number
  quantity: number
  notes?: string
}

async function mapItemsToOrderInput(
  database: Database,
  establishmentId: string,
  items: Array<{ name: string; quantity: number; unitPrice: number }>
): Promise<OrderItemInput[]> {
  const result: OrderItemInput[] = []

  for (const item of items) {
    const existing = await database.query.products.findFirst({
      where: and(
        eq(schema.products.establishmentId, establishmentId),
        ilike(schema.products.name, item.name)
      ),
    })

    if (existing) {
      result.push({
        productId: existing.id,
        productName: existing.name,
        unitPrice: Number(existing.price),
        quantity: item.quantity,
      })
    } else {
      result.push({
        productName: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        notes: '[iFood] Produto não mapeado',
      })
    }
  }

  return result
}
