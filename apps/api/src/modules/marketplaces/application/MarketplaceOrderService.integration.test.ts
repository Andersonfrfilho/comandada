import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { eq, sql } from 'drizzle-orm'
import { Pool } from 'pg'

import * as schema from '@/infra/database/schema'
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import {
  MarketplaceApiError,
  type MarketplaceAction,
  type MarketplaceDispute,
  type MarketplaceDisputeResponse,
  type MarketplaceEvent,
  type MarketplaceOrder,
  type MarketplaceOrderContext,
  type MarketplacePlatform,
  type MarketplaceProvider,
} from '../domain/Marketplace'
import type { MarketplaceConnection } from '../infra/marketplaceConfig'
import { MarketplaceOrderService } from './MarketplaceOrderService'

// Ex.: TEST_DATABASE_URL=postgres://ci:ci@localhost:5432/comandada_test bun test integration
const DATABASE_URL = process.env['TEST_DATABASE_URL']
const silentHub = { publishBroadcast: async () => undefined } as never

class FakeProvider implements MarketplaceProvider {
  readonly platform: MarketplacePlatform = 'ifood'
  actions: Array<[string, MarketplaceAction]> = []
  cancellations: Array<[string, string, string | undefined]> = []
  responses: Array<[string, MarketplaceDisputeResponse]> = []
  contexts: MarketplaceOrderContext[] = []
  queue: MarketplaceEvent[] = []
  acknowledged: string[] = []
  orderFetches = 0
  failOrder = false
  notFound = false
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
    if (this.notFound) throw new MarketplaceApiError('ifood', 'getOrder', 404, '')
    return this.order
  }
  async sendAction(externalId: string, action: MarketplaceAction, context?: MarketplaceOrderContext) {
    this.actions.push([externalId, action])
    if (context) this.contexts.push(context)
  }
  async cancellationReasons() {
    return [{ code: '503', description: 'ITEM INDISPONIVEL' }]
  }
  async requestCancellation(externalId: string, cancellation: { code?: string | undefined; reason: string }) {
    this.cancellations.push([externalId, cancellation.reason, cancellation.code])
  }
  parseDispute(event: MarketplaceEvent): MarketplaceDispute | null {
    const disputeId = event.metadata?.['disputeId']
    if (typeof disputeId !== 'string') return null
    return {
      externalId: disputeId,
      orderExternalId: event.orderId,
      kind: 'refund',
      message: 'Veio frio',
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      alternatives: [{ id: 'alt-1', type: 'refund', maxAmount: 20 }],
    }
  }
  parseDisputeSettlement(event: MarketplaceEvent) {
    const disputeId = event.metadata?.['disputeId']
    return typeof disputeId === 'string' ? { disputeExternalId: disputeId, status: 'accepted' } : null
  }
  async respondDispute(dispute: MarketplaceDispute, response: MarketplaceDisputeResponse) {
    this.responses.push([dispute.externalId, response])
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

  const build = (provider: FakeProvider, autoConfirm = true, now?: () => Date) => {
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
    const connections = new Map<MarketplacePlatform, MarketplaceConnection>([['ifood', { provider, establishmentId, merchantIds: ['m1'] }]])
    const alerts: Array<[string, unknown]> = []
    const hub = { publishBroadcast: async (_establishment: string, type: string, payload?: unknown) => void alerts.push([type, payload]) }
    service = new MarketplaceOrderService(db, connections, createOrder, () => updateStatus, { autoConfirm }, hub, now)
    return { service, updateStatus, alerts }
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
    expect(provider.cancellations).toEqual([['ifood-order-1', 'Acabou o salmão', undefined]])

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

  it('entrega própria: "saiu" manda pronto antes, com o entregador', async () => {
    const provider = new FakeProvider(marketplaceOrder({ deliveredBy: 'merchant' }))
    const { service, updateStatus } = build(provider)
    const orderId = await service.importOrder('ifood', 'ifood-order-1')
    await updateStatus.execute({ orderId, establishmentId, newStatus: 'in_delivery', manual: true })
    await settle()
    expect(provider.actions.map(([, action]) => action)).toEqual(['confirm', 'readyForPickup', 'dispatch'])
    expect(provider.contexts.at(-1)?.courier?.name).toBe('Yuyake')
  })

  it('pedido ainda não liberado (404) tenta de novo e desiste depois de 10 min', async () => {
    const provider = new FakeProvider(marketplaceOrder())
    provider.notFound = true
    const recent = { ...placed('e1'), createdAt: new Date().toISOString() }
    const { service } = build(provider)
    expect(await service.handleEvents('ifood', [recent])).toEqual([])
    const old = { ...placed('e2'), createdAt: new Date(Date.now() - 11 * 60_000).toISOString() }
    expect((await service.handleEvents('ifood', [old])).map((event) => event.id)).toEqual(['e2'])
    expect(await db.select().from(schema.orders)).toHaveLength(0)
  })

  it('cancelar pela plataforma com motivo: pedido segue aberto até ela confirmar; recusa avisa o painel', async () => {
    const provider = new FakeProvider(marketplaceOrder())
    const { service, alerts } = build(provider)
    const orderId = await service.importOrder('ifood', 'ifood-order-1')
    expect(await service.cancellationReasons(establishmentId, orderId)).toHaveLength(1)
    await service.cancelOnPlatform(establishmentId, orderId, { code: '503', reason: 'Acabou o salmão' })
    expect(provider.cancellations).toEqual([['ifood-order-1', 'Acabou o salmão', '503']])
    let order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) })
    expect(order!.status).not.toBe('cancelled')
    expect((await service.orderView(establishmentId, orderId))!.platformStatus).toBe('cancellation_requested')

    await service.handleEvents('ifood', [
      { id: 'f1', code: 'CARF', kind: 'cancellation_failed', orderId: 'ifood-order-1', metadata: { reason: 'Pedido já saiu' } },
    ])
    order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) })
    expect(order!.notes).toContain('recusou o cancelamento: Pedido já saiu')
    expect(alerts.map(([type]) => type)).toContain('marketplace:cancellation_failed')
    expect((await service.orderView(establishmentId, orderId))!.platformStatus).toBe('confirmed')

    // Outro restaurante não vê nem cancela.
    await expect(service.cancellationReasons('00000000-0000-0000-0000-000000000000', orderId)).rejects.toThrow()
  })

  it('negociação aberta fica no painel, é respondida uma vez e fecha com o evento da plataforma', async () => {
    const provider = new FakeProvider(marketplaceOrder())
    const { service, alerts } = build(provider)
    const orderId = await service.importOrder('ifood', 'ifood-order-1')
    const opened = { id: 'd1', code: 'HSD', kind: 'dispute_opened' as const, orderId: 'ifood-order-1', metadata: { disputeId: 'disp-1' } }
    await service.handleEvents('ifood', [opened])
    await service.handleEvents('ifood', [{ ...opened, id: 'd1-again' }])

    const open = await service.listDisputes(establishmentId, { openOnly: true })
    expect(open).toHaveLength(1)
    expect(open[0]!.orderId).toBe(orderId)
    expect(alerts.filter(([type]) => type === 'marketplace:dispute_opened')).toHaveLength(1)

    await expect(
      service.respondDispute(establishmentId, open[0]!.id, { decision: 'alternative', alternativeId: 'nao-existe' }, undefined)
    ).rejects.toThrow()
    const answered = await service.respondDispute(establishmentId, open[0]!.id, { decision: 'alternative', alternativeId: 'alt-1', amount: 10 }, undefined)
    expect(answered.status).toBe('responded')
    expect(provider.responses).toEqual([['disp-1', { decision: 'alternative', alternativeId: 'alt-1', amount: 10 }]])
    await expect(service.respondDispute(establishmentId, open[0]!.id, { decision: 'accept' }, undefined)).rejects.toThrow()

    await service.handleEvents('ifood', [{ id: 's1', code: 'HSS', kind: 'dispute_settled', orderId: 'ifood-order-1', metadata: { disputeId: 'disp-1' } }])
    const [settled] = await service.listDisputes(establishmentId)
    expect(settled!.status).toBe('accepted')
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) })
    expect(order!.notes).toContain('cliente abriu negociação (reembolso)')
    expect(order!.notes).toContain('encerrada: aceita')
  })

  it('negociação sem resposta depois do prazo aparece como vencida', async () => {
    const provider = new FakeProvider(marketplaceOrder())
    const later = () => new Date(Date.now() + 10 * 60_000)
    const { service } = build(provider, true, later)
    await service.importOrder('ifood', 'ifood-order-1')
    await service.handleEvents('ifood', [{ id: 'd1', code: 'HSD', kind: 'dispute_opened', orderId: 'ifood-order-1', metadata: { disputeId: 'disp-1' } }])
    expect(await service.listDisputes(establishmentId, { openOnly: true })).toEqual([])
    expect((await service.listDisputes(establishmentId))[0]!.status).toBe('expired')
  })
})
