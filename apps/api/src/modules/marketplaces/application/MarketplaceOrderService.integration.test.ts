import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { eq, sql } from 'drizzle-orm'
import { Pool } from 'pg'

import * as schema from '@/infra/database/schema'
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import type {
  MarketplaceAction,
  MarketplaceEvent,
  MarketplaceOrder,
  MarketplacePlatform,
  MarketplaceProvider,
} from '../domain/Marketplace'
import type { MarketplaceConnection } from '../infra/marketplaceConfig'
import { MarketplaceOrderService } from './MarketplaceOrderService'

// Ex.: TEST_DATABASE_URL=postgres://ci:ci@localhost:5432/comandada_test bun test integration
const DATABASE_URL = process.env['TEST_DATABASE_URL']
const silentHub = { publishBroadcast: async () => undefined } as never

class FakeProvider implements MarketplaceProvider {
  readonly platform: MarketplacePlatform = 'ifood'
  actions: Array<[string, MarketplaceAction]> = []
  cancellations: Array<[string, string]> = []
  queue: MarketplaceEvent[] = []
  acknowledged: string[] = []
  orderFetches = 0
  failOrder = false
  constructor(private readonly order: MarketplaceOrder) {}
  async pollEvents() {
    const events = this.queue
    this.queue = []
    return events
  }
  async acknowledge(events: MarketplaceEvent[]) {
    this.acknowledged.push(...events.map((event) => event.id))
  }
  async getOrder() {
    this.orderFetches += 1
    if (this.failOrder) throw new Error('fora do ar')
    return this.order
  }
  async sendAction(externalId: string, action: MarketplaceAction) {
    this.actions.push([externalId, action])
  }
  async requestCancellation(externalId: string, reason: string) {
    this.cancellations.push([externalId, reason])
  }
  verifyWebhook() {
    return true
  }
  parseWebhook() {
    return []
  }
}

const marketplaceOrder = (overrides: Partial<MarketplaceOrder> = {}): MarketplaceOrder => ({
  platform: 'ifood',
  externalId: 'ifood-order-1',
  displayId: '8312',
  type: 'delivery',
  customerName: 'Maria',
  items: [
    { name: 'Hot roll', quantity: 2, unitPrice: 28, notes: 'sem cebolinha', options: [] },
    { name: 'Refrigerante', quantity: 1, unitPrice: 8, options: [] },
  ],
  deliveryFee: 7.99,
  discount: 0,
  orderAmount: 71.99,
  payments: [{ method: 'Crédito', prepaid: true, amount: 71.99 }],
  deliveryAddress: { formatted: 'Rua das Flores, 10' },
  deliveredBy: 'platform',
  ...overrides,
})

const placed = (id: string, orderId = 'ifood-order-1'): MarketplaceEvent => ({ id, code: 'PLACED', kind: 'placed', orderId })

describe.skipIf(!DATABASE_URL)('Pedidos de marketplace (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let establishmentId: string

  const build = (provider: FakeProvider, autoConfirm = true) => {
    const createOrder = new CreateOrderUseCase(db, silentHub)
    let service: MarketplaceOrderService | undefined
    const updateStatus = new UpdateOrderStatusUseCase(
      db,
      silentHub,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      async (order, newStatus) => service?.onOrderStatusChanged(order, newStatus)
    )
    const connections = new Map<MarketplacePlatform, MarketplaceConnection>([['ifood', { provider, establishmentId }]])
    service = new MarketplaceOrderService(db, connections, createOrder, () => updateStatus, { autoConfirm })
    return { service, updateStatus }
  }

  // O aviso para a plataforma roda sem esperar a mudança de status.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    await migrate(db, { migrationsFolder: path.join(import.meta.dir, '../../../../drizzle/migrations') })
  })

  afterAll(async () => {
    await pool?.end()
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE establishments, marketplace_events CASCADE`)
    const [establishment] = await db.insert(schema.establishments).values({ name: 'Yuyake' }).returning()
    establishmentId = establishment!.id
    await db.insert(schema.products).values({ establishmentId, name: 'Hot Roll', slug: 'hot-roll', price: '30.00' })
  })

  it('pedido novo entra uma vez só, com preço da plataforma, número e aceite automático', async () => {
    const provider = new FakeProvider(marketplaceOrder())
    const { service } = build(provider)
    provider.queue = [placed('e1'), placed('e1')]
    await service.pollAll()
    provider.queue = [placed('e2')]
    await service.pollAll()

    const orders = await db.query.orders.findMany({ with: { items: true } })
    expect(orders).toHaveLength(1)
    const order = orders[0]!
    expect(order.channel).toBe('ifood')
    expect(order.code).toBe('8312')
    expect(order.customerName).toBe('Maria')
    // Entregador do iFood: sem taxa no total do restaurante e fora de Entregas.
    expect(order.totalAmount).toBe('64.00')
    expect(order.notes).toContain('Pedido iFood #8312')
    expect(order.items.find((item) => item.productName === 'Hot Roll')?.productId).toBeTruthy()
    expect(order.items.find((item) => item.productName === 'Refrigerante')?.notes).toContain('sem vínculo')
    expect(await db.select().from(schema.deliveries)).toHaveLength(0)

    expect(provider.orderFetches).toBe(1)
    expect(provider.actions).toEqual([['ifood-order-1', 'confirm']])
    expect(provider.acknowledged).toEqual(['e1', 'e1', 'e2'])
  })

  it('entrega própria entra em Entregas com a taxa da plataforma', async () => {
    const provider = new FakeProvider(marketplaceOrder({ deliveredBy: 'merchant' }))
    const { service } = build(provider)
    await service.handleEvents('ifood', [placed('e1')])
    const [order] = await db.select().from(schema.orders)
    expect(order!.totalAmount).toBe('71.99')
    expect(await db.select().from(schema.deliveries)).toHaveLength(1)
  })

  it('falha ao buscar o pedido não confirma o evento, e ele volta no próximo polling', async () => {
    const provider = new FakeProvider(marketplaceOrder())
    const { service } = build(provider)
    provider.failOrder = true
    provider.queue = [placed('e1')]
    await service.pollAll()
    expect(provider.acknowledged).toEqual([])
    provider.failOrder = false
    provider.queue = [placed('e1')]
    await service.pollAll()
    expect(provider.acknowledged).toEqual(['e1'])
    expect(await db.select().from(schema.orders)).toHaveLength(1)
  })

  it('status do painel vai para a plataforma; aceite manual sai junto com o preparo', async () => {
    const provider = new FakeProvider(marketplaceOrder())
    const { service, updateStatus } = build(provider, false)
    const orderId = await service.importOrder('ifood', 'ifood-order-1')
    expect(provider.actions).toEqual([])

    await updateStatus.execute({ orderId, establishmentId, newStatus: 'in_production' })
    await settle()
    await updateStatus.execute({ orderId, establishmentId, newStatus: 'ready' })
    await settle()
    expect(provider.actions.map(([, action]) => action)).toEqual(['confirm', 'startPreparation', 'readyForPickup'])
  })

  it('cancelar no painel pede cancelamento na plataforma; cancelado na plataforma não volta em eco', async () => {
    const provider = new FakeProvider(marketplaceOrder())
    const { service, updateStatus } = build(provider)
    const orderId = await service.importOrder('ifood', 'ifood-order-1')
    await updateStatus.execute({ orderId, establishmentId, newStatus: 'cancelled', cancellationReason: 'Acabou o salmão' })
    await settle()
    expect(provider.cancellations).toEqual([['ifood-order-1', 'Acabou o salmão']])

    // Segundo pedido: cancelado pelo cliente no iFood.
    const second = new FakeProvider(marketplaceOrder({ externalId: 'ifood-order-2', displayId: '9000' }))
    const built = build(second)
    await built.service.handleEvents('ifood', [placed('p2', 'ifood-order-2')])
    await built.service.handleEvents('ifood', [{ id: 'c2', code: 'CANCELLED', kind: 'cancelled', orderId: 'ifood-order-2' }])
    await settle()
    const cancelled = await db.query.orders.findFirst({ where: eq(schema.orders.code, '9000') })
    expect(cancelled!.status).toBe('cancelled')
    expect(cancelled!.cancellationReason).toBe('Cancelado no iFood')
    expect(second.cancellations).toEqual([])
  })
})
