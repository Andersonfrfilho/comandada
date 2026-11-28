import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { eq, inArray, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { createMercadoPagoPaymentProvider } from '@adatechnology/mercadopago-payment-provider'

import * as schema from '@/infra/database/schema'
import { runRecipeStockMigrations } from '@/infra/database/runRecipeStockMigrations'
import { AddCashMovementUseCase } from '@/modules/cashier/application/use-cases/AddCashMovementUseCase'
import { AppError } from '@/shared/errors/AppError'
import { netCashAmount } from '@/modules/cashier/shared/cashMovementAmounts'
import { OrderRefundLedger } from '../services/OrderRefundLedger'
import { OrderCancellationPayments } from '../services/OrderCancellationPayments'
import { RefundOrderPaymentUseCase } from './RefundOrderPaymentUseCase'
import { GetOrderPaymentSummaryUseCase } from './GetOrderPaymentSummaryUseCase'

// O livro de estornos depende de UPDATE condicional e de somas no Postgres: roda num banco de verdade.
// Ex.: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/comandada_test bun test integration
const DATABASE_URL = process.env['TEST_DATABASE_URL']

type ApiCall = { method: string; path: string; body: unknown; idempotencyKey: string | undefined }

describe.skipIf(!DATABASE_URL)('RefundOrderPaymentUseCase (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let establishmentId: string
  let userId: string
  let apiCalls: ApiCall[]
  let refundResponse: { status: number; body: Record<string, unknown> }
  let messages: string[]

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    await runRecipeStockMigrations({ db })
    await migrate(db, { migrationsFolder: path.join(import.meta.dir, '../../../../../drizzle/migrations') })
  })

  afterAll(async () => {
    await pool?.end()
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE establishments CASCADE`)
    const [establishment] = await db.insert(schema.establishments).values({ name: 'Yuyaki' }).returning()
    establishmentId = establishment!.id
    const [role] = await db.insert(schema.roles).values({ establishmentId, name: 'Gerente' }).returning()
    const [user] = await db
      .insert(schema.users)
      .values({ establishmentId, roleId: role!.id, name: 'Ana', email: `ana-${Date.now()}@yuyaki.test`, passwordHash: 'x' })
      .returning()
    userId = user!.id
    await db.insert(schema.cashRegisters).values({ establishmentId, userId, openingAmount: '100.00' })
    apiCalls = []
    messages = []
    refundResponse = { status: 201, body: { id: 9001, payment_id: 777, amount: 50.4, status: 'approved' } }
  })

  function build() {
    const fakeFetch = async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      apiCalls.push({
        method: init?.method ?? 'GET',
        path: new URL(url).pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        idempotencyKey: headers['X-Idempotency-Key'],
      })
      if (init?.method === 'PUT') return new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 })
      const body = init?.body ? (JSON.parse(String(init.body)) as { amount?: number }) : {}
      return new Response(JSON.stringify({ ...refundResponse.body, amount: body.amount ?? refundResponse.body['amount'] }), {
        status: refundResponse.status,
      })
    }
    const accounts = {
      findAccount: async () => ({ id: 'account', provider: 'mercadopago' }) as never,
      gatewayFor: () => createMercadoPagoPaymentProvider({ accessToken: 'TEST-token', webhookSecret: 'segredo', fetch: fakeFetch }),
    }
    const ledger = new OrderRefundLedger({
      db,
      wsHub: { publishBroadcast: async () => undefined },
      botMessages: {
        sendText: async ({ body }) => {
          messages.push(body)
        },
      },
      addCashMovement: new AddCashMovementUseCase(db),
    })
    return {
      refunds: new RefundOrderPaymentUseCase(db, accounts, ledger),
      summary: new GetOrderPaymentSummaryUseCase(db, ledger, accounts),
      cancellation: new OrderCancellationPayments(db, accounts),
    }
  }

  async function onlineOrder(paymentStatus = 'paid', chargeStatus = 'approved') {
    const [customer] = await db
      .insert(schema.customers)
      .values({ establishmentId, name: 'Maria', whatsappNumber: '5516991112233' })
      .returning()
    const [order] = await db
      .insert(schema.orders)
      .values({
        establishmentId,
        customerId: customer!.id,
        channel: 'whatsapp',
        type: 'delivery',
        totalAmount: '50.40',
        code: 'PED-42',
        paymentStatus,
      })
      .returning()
    const [charge] = await db
      .insert(schema.paymentCharges)
      .values({
        establishmentId,
        orderId: order!.id,
        provider: 'mercadopago',
        kind: 'pix',
        providerChargeId: '777',
        providerPaymentId: chargeStatus === 'approved' ? '777' : null,
        status: chargeStatus,
        amount: '50.40',
        paidAt: chargeStatus === 'approved' ? new Date() : null,
      })
      .returning()
    return { order: order!, charge: charge! }
  }

  async function cashOrder() {
    const [order] = await db
      .insert(schema.orders)
      .values({ establishmentId, channel: 'manual', type: 'pickup', totalAmount: '30.00', status: 'completed' })
      .returning()
    await new AddCashMovementUseCase(db).execute({
      establishmentId,
      type: 'payment',
      paymentMethod: 'cash',
      amount: 30,
      orderId: order!.id,
    })
    return order!
  }

  async function cashMovements(orderId: string) {
    return db.select().from(schema.cashMovements).where(eq(schema.cashMovements.orderId, orderId))
  }

  async function reload(orderId: string) {
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId))
    return order!
  }

  it('estorno total online: chama o Mercado Pago sem valor, sai do caixa e avisa o cliente', async () => {
    const { refunds } = build()
    const { order, charge } = await onlineOrder()

    const result = await refunds.execute({ establishmentId, orderId: order.id, userId, reason: 'Cliente desistiu' })

    expect(apiCalls).toEqual([
      { method: 'POST', path: '/v1/payments/777/refunds', body: {}, idempotencyKey: `refund-${result.refund.id}` },
    ])
    expect(result).toMatchObject({ paymentStatus: 'refunded', refundedAmount: 50.4, cashRecorded: true })
    expect(result.refund).toMatchObject({ method: 'online', providerRefundId: '9001', status: 'approved', amount: '50.40' })
    expect(await reload(order.id)).toMatchObject({ paymentStatus: 'refunded', refundedAmount: '50.40' })
    const [updatedCharge] = await db.select().from(schema.paymentCharges).where(eq(schema.paymentCharges.id, charge.id))
    expect(updatedCharge!.status).toBe('refunded')
    expect((await cashMovements(order.id)).map((movement) => [movement.type, movement.paymentMethod, movement.amount])).toEqual([
      ['refund', 'pix', '50.40'],
    ])
    expect(messages[0]).toContain('estornado')
  })

  it('estorno parcial manda o valor, e o resto ainda pode ser devolvido depois', async () => {
    const { refunds } = build()
    const { order } = await onlineOrder()

    const first = await refunds.execute({ establishmentId, orderId: order.id, amount: 10.4, userId })
    expect(apiCalls[0]?.body).toEqual({ amount: 10.4 })
    expect(first).toMatchObject({ paymentStatus: 'partially_refunded', refundedAmount: 10.4 })
    expect(messages[0]).toContain('R$')

    const second = await refunds.execute({ establishmentId, orderId: order.id, userId })
    // O restante vai com valor: o provedor não sabe o que "tudo" significa depois de um parcial.
    expect(apiCalls[1]?.body).toEqual({ amount: 40 })
    expect(second).toMatchObject({ paymentStatus: 'refunded', refundedAmount: 50.4 })
  })

  it('não devolve mais do que entrou', async () => {
    const { refunds } = build()
    const { order } = await onlineOrder()
    await expect(refunds.execute({ establishmentId, orderId: order.id, amount: 60 })).rejects.toBeInstanceOf(AppError)
    expect(apiCalls).toHaveLength(0)
    expect((await reload(order.id)).refundedAmount).toBe('0.00')
  })

  it('dois cliques ao mesmo tempo devolvem uma vez só', async () => {
    const { refunds } = build()
    const { order } = await onlineOrder()
    const results = await Promise.allSettled([
      refunds.execute({ establishmentId, orderId: order.id }),
      refunds.execute({ establishmentId, orderId: order.id }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(apiCalls).toHaveLength(1)
    expect((await reload(order.id)).refundedAmount).toBe('50.40')
    expect(await cashMovements(order.id)).toHaveLength(1)
  })

  it('recusa do provedor desfaz a reserva e o pedido pode tentar de novo', async () => {
    const { refunds } = build()
    const { order } = await onlineOrder()
    refundResponse = { status: 400, body: { message: 'Insufficient balance' } }

    await expect(refunds.execute({ establishmentId, orderId: order.id })).rejects.toThrow('Insufficient balance')
    expect(await reload(order.id)).toMatchObject({ paymentStatus: 'paid', refundedAmount: '0.00' })
    const [failed] = await db.select().from(schema.paymentRefunds).where(eq(schema.paymentRefunds.orderId, order.id))
    expect(failed).toMatchObject({ status: 'failed', failureMessage: expect.stringContaining('Insufficient balance') })
    expect(await cashMovements(order.id)).toHaveLength(0)

    refundResponse = { status: 201, body: { id: 9002, amount: 50.4, status: 'approved' } }
    await refunds.execute({ establishmentId, orderId: order.id })
    expect((await reload(order.id)).paymentStatus).toBe('refunded')
  })

  it('pedido pago no balcão: devolução na mão, sem provedor, saindo do caixa na forma que entrou', async () => {
    const { refunds, summary } = build()
    const order = await cashOrder()
    expect(await summary.execute({ establishmentId, orderId: order.id })).toMatchObject({
      paid: '30.00',
      refundable: '30.00',
      refundMode: 'manual',
    })

    const result = await refunds.execute({ establishmentId, orderId: order.id, amount: 5, userId, reason: 'Item errado' })

    expect(apiCalls).toHaveLength(0)
    expect(result.refund).toMatchObject({ method: 'manual', paymentMethod: 'cash', amount: '5.00' })
    expect(result.paymentStatus).toBe('partially_refunded')
    expect((await cashMovements(order.id)).map((movement) => movement.type).sort()).toEqual(['payment', 'refund'])
    const view = await summary.execute({ establishmentId, orderId: order.id })
    expect(view).toMatchObject({ refunded: '5.00', refundable: '25.00' })
    expect(view.refunds[0]).toMatchObject({ createdBy: 'Ana', reason: 'Item errado' })
  })

  it('pedido sem pagamento não tem o que devolver', async () => {
    const { refunds, summary } = build()
    const [order] = await db
      .insert(schema.orders)
      .values({ establishmentId, channel: 'manual', type: 'pickup', totalAmount: '30.00' })
      .returning()
    expect((await summary.execute({ establishmentId, orderId: order!.id })).refundMode).toBe('none')
    await expect(refunds.execute({ establishmentId, orderId: order!.id })).rejects.toThrow('não tem pagamento')
  })

  it('caixa fechado: a devolução vale, só não entra no caixa', async () => {
    const { refunds } = build()
    const { order } = await onlineOrder()
    await db.update(schema.cashRegisters).set({ status: 'closed' })
    const result = await refunds.execute({ establishmentId, orderId: order.id })
    expect(result).toMatchObject({ paymentStatus: 'refunded', cashRecorded: false })
  })

  it('cancelar com Pix em aberto cancela a cobrança no provedor', async () => {
    const { cancellation } = build()
    const { order, charge } = await onlineOrder('awaiting', 'pending')

    expect(await cancellation.releasePending(order)).toBe(1)
    expect(apiCalls).toEqual([{ method: 'PUT', path: '/v1/payments/777', body: { status: 'cancelled' }, idempotencyKey: undefined }])
    expect((await reload(order.id)).paymentStatus).toBe('failed')
    const [updatedCharge] = await db.select().from(schema.paymentCharges).where(eq(schema.paymentCharges.id, charge.id))
    expect(updatedCharge!.status).toBe('failed')
  })

  it('cancelar pedido já pago não mexe na cobrança (o estorno é pedido à parte)', async () => {
    const { cancellation } = build()
    const { order } = await onlineOrder()
    expect(await cancellation.releasePending(order)).toBe(0)
    expect(apiCalls).toHaveLength(0)
    expect((await reload(order.id)).paymentStatus).toBe('paid')
  })

  it('faturamento do caixa desconta a devolução', async () => {
    const { refunds } = build()
    const order = await cashOrder()
    await refunds.execute({ establishmentId, orderId: order.id, amount: 12.5 })
    const [row] = await db
      .select({ total: sql<string>`sum(${netCashAmount})` })
      .from(schema.cashMovements)
      .where(inArray(schema.cashMovements.type, ['payment', 'refund']))
    expect(Number(row!.total)).toBe(17.5)
  })
})
