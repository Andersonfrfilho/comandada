import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { eq, sql } from 'drizzle-orm'
import { Pool } from 'pg'

import * as schema from '@/infra/database/schema'
import { runRecipeStockMigrations } from '@/infra/database/runRecipeStockMigrations'
import { AppError } from '@/shared/errors/AppError'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import { AddCashMovementUseCase } from '@/modules/cashier/application/use-cases/AddCashMovementUseCase'
import { CloseCashRegisterUseCase } from '@/modules/cashier/application/use-cases/CloseCashRegisterUseCase'
import { DeductStockForOrderUseCase } from '@/modules/products/application/use-cases/DeductStockForOrderUseCase'
import { RestoreStockForOrderUseCase } from '@/modules/products/application/use-cases/RestoreStockForOrderUseCase'
import { GetDashboardMetricsUseCase } from '@/modules/dashboard/application/use-cases/GetDashboardMetricsUseCase'
import { GetMonthlyReportUseCase } from '@/modules/reports/application/use-cases/GetMonthlyReportUseCase'
import { localYearMonth } from '@/modules/reports/shared/revenue'
import { CreateOrderUseCase } from './CreateOrderUseCase'
import { UpdateOrderStatusUseCase } from './UpdateOrderStatusUseCase'
import { RecordOrderPaymentsUseCase } from '@/modules/cashier/application/use-cases/RecordOrderPaymentsUseCase'
import { DrizzleTableRepository } from '@/modules/tables/infra/repositories/DrizzleTableRepository'
import { DrizzleComandaRepository } from '@/modules/tables/infra/repositories/DrizzleComandaRepository'
import { GetComandaBillUseCase } from '@/modules/tables/application/use-cases/GetComandaBillUseCase'
import { SettleComandaUseCase } from '@/modules/tables/application/use-cases/SettleComandaUseCase'
import { CloseComandaUseCase } from '@/modules/tables/application/use-cases/CloseComandaUseCase'

// Regras de dinheiro e estoque que dependem do Postgres (somas, travas, fuso).
// Ex.: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/comandada_test bun test integration
const DATABASE_URL = process.env['TEST_DATABASE_URL']

const noCache: CacheProvider = {
  get: async () => null,
  set: async () => undefined,
} as unknown as CacheProvider

const silentHub = { publishBroadcast: async () => undefined } as never

describe.skipIf(!DATABASE_URL)('Dinheiro e estoque do pedido (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let establishmentId: string
  let userId: string
  let productId: string
  let ingredientId: string
  let batchId: string

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

    const [product] = await db
      .insert(schema.products)
      .values({ establishmentId, name: 'Hot roll', slug: 'hot-roll', price: '30.00' })
      .returning()
    productId = product!.id
    const [ingredient] = await db
      .insert(schema.ingredients)
      .values({ establishmentId, name: 'Salmão', unit: 'kg', stockQuantity: '10' })
      .returning()
    ingredientId = ingredient!.id
    const [batch] = await db
      .insert(schema.stockBatches)
      .values({
        establishmentId,
        ingredientId,
        batchNumber: 'L1',
        quantity: '10',
        remainingQuantity: '10',
        costPerUnit: '50',
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning()
    batchId = batch!.id
    await db.insert(schema.productIngredients).values({ productId, ingredientId, quantity: '0.5', unit: 'kg' })
  })

  function statusUseCase() {
    const deduct = new DeductStockForOrderUseCase(db)
    return new UpdateOrderStatusUseCase(
      db,
      silentHub,
      undefined,
      deduct,
      undefined,
      undefined,
      undefined,
      new RestoreStockForOrderUseCase(db)
    )
  }

  async function newOrder(quantity = 2, overrides: Partial<schema.NewOrder> = {}) {
    const [order] = await db
      .insert(schema.orders)
      .values({ establishmentId, channel: 'manual', type: 'pickup', totalAmount: (30 * quantity).toFixed(2), ...overrides })
      .returning()
    await db.insert(schema.orderItems).values({
      orderId: order!.id,
      productId,
      productName: 'Hot roll',
      unitPrice: '30.00',
      quantity,
      totalPrice: (30 * quantity).toFixed(2),
    })
    return order!
  }

  async function stock() {
    const ingredient = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.id, ingredientId) })
    const batch = await db.query.stockBatches.findFirst({ where: eq(schema.stockBatches.id, batchId) })
    return { ingredient: Number(ingredient!.stockQuantity), batch: Number(batch!.remainingQuantity) }
  }

  async function move(orderId: string, newStatus: schema.Order['status'], manual = false) {
    return statusUseCase().execute({ orderId, establishmentId, newStatus, manual, userId })
  }

  describe('estoque', () => {
    it('cancelar devolve ao lote e ao ingrediente o que a receita baixou', async () => {
      const order = await newOrder(2)
      await move(order.id, 'in_production')
      expect(await stock()).toEqual({ ingredient: 9, batch: 9 })

      await move(order.id, 'cancelled')
      expect(await stock()).toEqual({ ingredient: 10, batch: 10 })
    })

    it('cancelar duas vezes (reabrir no meio) não devolve em dobro, e produzir de novo baixa de novo', async () => {
      const order = await newOrder(2)
      await move(order.id, 'in_production')
      await move(order.id, 'cancelled')
      await move(order.id, 'received', true)
      await move(order.id, 'in_production')
      expect(await stock()).toEqual({ ingredient: 9, batch: 9 })

      await move(order.id, 'cancelled')
      await new RestoreStockForOrderUseCase(db).execute({ orderId: order.id, establishmentId })
      expect(await stock()).toEqual({ ingredient: 10, batch: 10 })
    })

    it('pular direto de Recebido para Concluído dá a baixa, mesmo sem saldo', async () => {
      const order = await newOrder(30)
      await move(order.id, 'completed', true)
      const after = await stock()
      expect(after.batch).toBe(0)
      expect(after.ingredient).toBe(-5)
    })

    it('cancelar pedido que nunca foi produzido não mexe no estoque', async () => {
      const order = await newOrder(2)
      await move(order.id, 'cancelled')
      expect(await stock()).toEqual({ ingredient: 10, batch: 10 })
    })

    it('cancela pedido concluído como correção manual', async () => {
      const order = await newOrder(1)
      await move(order.id, 'completed', true)
      const cancelled = await move(order.id, 'cancelled', true)
      expect(cancelled.status).toBe('cancelled')
      expect(await stock()).toEqual({ ingredient: 10, batch: 10 })
    })
  })

  describe('caixa', () => {
    async function openRegister(openingAmount = '100.00') {
      const [register] = await db.insert(schema.cashRegisters).values({ establishmentId, userId, openingAmount }).returning()
      return register!
    }

    it('dinheiro esperado na gaveta ignora Pix e cartão, e a diferença fica gravada', async () => {
      const register = await openRegister('100.00')
      const movements = new AddCashMovementUseCase(db)
      await movements.execute({ establishmentId, type: 'payment', paymentMethod: 'cash', amount: 40 })
      await movements.execute({ establishmentId, type: 'payment', paymentMethod: 'pix', amount: 33.9 })
      await movements.execute({ establishmentId, type: 'payment', paymentMethod: 'card_credit', amount: 50 })
      await movements.execute({ establishmentId, type: 'supply', amount: 20 })
      await movements.execute({ establishmentId, type: 'withdrawal', amount: 30 })
      await movements.execute({ establishmentId, type: 'refund', paymentMethod: 'cash', amount: 5 })

      const closed = await new CloseCashRegisterUseCase(db).execute({
        registerId: register.id,
        establishmentId,
        closingAmount: 120,
        userId,
        notes: 'faltou 5 de troco',
      })

      expect(closed.summary.expectedCash).toBe('125.00')
      expect(closed.expectedCashAmount).toBe('125.00')
      expect(closed.closingDifference).toBe('-5.00')
      expect(closed.closedByUserId).toBe(userId)
      expect(closed.summary.byMethod.find((total) => total.method === 'pix')?.net).toBe('33.90')
    })

    it('fechar o mesmo caixa duas vezes falha na segunda', async () => {
      const register = await openRegister()
      const close = new CloseCashRegisterUseCase(db)
      await close.execute({ registerId: register.id, establishmentId, closingAmount: 100 })
      await expect(close.execute({ registerId: register.id, establishmentId, closingAmount: 100 })).rejects.toBeInstanceOf(AppError)
    })

    it('sangria maior que o dinheiro da gaveta é recusada no lançamento do painel', async () => {
      await openRegister('50.00')
      const movements = new AddCashMovementUseCase(db)
      await movements.execute({ establishmentId, type: 'payment', paymentMethod: 'pix', amount: 500 })
      await expect(
        movements.execute({ establishmentId, type: 'withdrawal', amount: 60, checkAsManualEntry: true })
      ).rejects.toThrow('maior que o dinheiro na gaveta')
      const accepted = await movements.execute({ establishmentId, type: 'withdrawal', amount: 50, checkAsManualEntry: true })
      expect(accepted.amount).toBe('50.00')
    })

    it('pagamento lançado à mão em pedido cancelado ou inexistente é recusado', async () => {
      await openRegister()
      const cancelled = await newOrder(1, { status: 'cancelled' })
      const movements = new AddCashMovementUseCase(db)
      await expect(
        movements.execute({ establishmentId, type: 'payment', paymentMethod: 'cash', amount: 30, orderId: cancelled.id, checkAsManualEntry: true })
      ).rejects.toThrow('cancelado')
      await expect(
        movements.execute({
          establishmentId,
          type: 'payment',
          paymentMethod: 'cash',
          amount: 30,
          orderId: '00000000-0000-0000-0000-000000000099',
          checkAsManualEntry: true,
        })
      ).rejects.toThrow('Pedido não encontrado')
    })
  })

  describe('faturamento', () => {
    it('Dashboard e Relatórios contam só concluídos, menos devoluções, no dia do restaurante', async () => {
      const now = new Date()
      await newOrder(2, { status: 'completed', completedAt: now })
      await newOrder(1, { status: 'completed', completedAt: now, refundedAmount: '10.00' })
      await newOrder(3, { status: 'cancelled', cancelledAt: now })
      await newOrder(4, { status: 'in_production' })

      const dashboard = await new GetDashboardMetricsUseCase(db, noCache).execute(establishmentId)
      expect(dashboard.revenuToday).toBe('80.00')
      expect(dashboard.ordersToday).toBe(4)

      const { year, month } = localYearMonth(now)
      const report = await new GetMonthlyReportUseCase(db, noCache).execute({ establishmentId, year, month })
      expect(report.summary.totalRevenue).toBe('80.00')
      expect(report.summary.completedOrders).toBe(2)
      expect(report.summary.cancelledOrders).toBe(1)
      expect(report.summary.avgTicket).toBe('40.00')
      expect(report.dailyBreakdown.reduce((sum, day) => sum + Number(day.revenue), 0)).toBe(80)
    })
  })

  describe('preço do pedido do painel', () => {
    function createUseCase() {
      return new CreateOrderUseCase(db, silentHub)
    }

    it('usa o preço e o nome do cardápio, não o que veio do navegador', async () => {
      const order = await createUseCase().execute({
        establishmentId,
        channel: 'manual',
        type: 'pickup',
        items: [{ productId, productName: 'Qualquer', unitPrice: 1, quantity: 2 }],
        priceFromCatalog: true,
      })
      expect(order.totalAmount).toBe('60.00')
      const items = await db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id) })
      expect(items[0]?.unitPrice).toBe('30.00')
      expect(items[0]?.productName).toBe('Hot roll')
    })

    it('guarda o nome digitado para cliente sem cadastro', async () => {
      const order = await createUseCase().execute({
        establishmentId,
        channel: 'manual',
        type: 'pickup',
        customerName: '  Dona Maria ',
        items: [{ productId, productName: 'Hot roll', unitPrice: 30, quantity: 1 }],
        priceFromCatalog: true,
      })
      expect(order.customerName).toBe('Dona Maria')
    })

    it('recusa produto fora do cardápio, item sem produto e produto desativado', async () => {
      await expect(createUseCase().execute({
        establishmentId,
        channel: 'manual',
        type: 'pickup',
        items: [{ productName: 'Livre', unitPrice: 1, quantity: 1 }],
        priceFromCatalog: true,
      })).rejects.toThrow('produto do cardápio')

      await db.update(schema.products).set({ active: false }).where(eq(schema.products.id, productId))
      await expect(createUseCase().execute({
        establishmentId,
        channel: 'manual',
        type: 'pickup',
        items: [{ productId, productName: 'Hot roll', unitPrice: 30, quantity: 1 }],
        priceFromCatalog: true,
      })).rejects.toThrow('fora do cardápio')
    })

    it('recusa pagamento acima do total, troco menor que o valor e agendamento no passado', async () => {
      const base = {
        establishmentId,
        channel: 'manual' as const,
        type: 'pickup' as const,
        items: [{ productId, productName: 'Hot roll', unitPrice: 30, quantity: 1 }],
        priceFromCatalog: true,
      }
      await expect(createUseCase().execute({ ...base, payments: [{ paymentTypeName: 'Pix', amount: 500 }] }))
        .rejects.toThrow('somam mais que o total')
      await expect(createUseCase().execute({ ...base, payments: [{ paymentTypeName: 'Dinheiro', amount: 30, changeFor: 20 }] }))
        .rejects.toThrow('troco para')
      await expect(createUseCase().execute({ ...base, scheduledFor: '2020-01-01T12:00:00.000Z' }))
        .rejects.toThrow('já passou')

      const ok = await createUseCase().execute({ ...base, payments: [{ paymentTypeName: 'Dinheiro', amount: 30, changeFor: 50 }] })
      expect(ok.totalAmount).toBe('30.00')
    })

    it('o iFood continua com o preço que veio dele', async () => {
      const order = await createUseCase().execute({
        establishmentId,
        channel: 'ifood',
        type: 'delivery',
        items: [{ productId, productName: 'Hot roll iFood', unitPrice: 35, quantity: 1 }],
      })
      expect(order.totalAmount).toBe('35.00')
    })
  })

  describe('número e entrega do pedido', () => {
    it('cada pedido novo ganha o próximo número do restaurante', async () => {
      const create = new CreateOrderUseCase(db, silentHub)
      const input = {
        establishmentId,
        channel: 'manual' as const,
        type: 'pickup' as const,
        items: [{ productId, productName: 'Hot roll', unitPrice: 30, quantity: 1 }],
        priceFromCatalog: true,
      }
      const [first, second] = await Promise.all([create.execute(input), create.execute(input)])
      expect([first.number, second.number].sort()).toEqual([1, 2])
    })

    async function deliveryOf(orderId: string) {
      return db.query.deliveries.findFirst({ where: eq(schema.deliveries.orderId, orderId) })
    }

    async function newDeliveryOrder() {
      const order = await newOrder(1, { type: 'delivery' })
      await db.insert(schema.deliveries).values({ orderId: order.id, establishmentId, addressSnapshot: { address: 'Rua A, 1' } })
      return order
    }

    it('entrega acompanha o pedido: cancelado sai da fila, concluído vira entregue, reaberto volta', async () => {
      const cancelled = await newDeliveryOrder()
      await move(cancelled.id, 'cancelled')
      expect((await deliveryOf(cancelled.id))?.status).toBe('failed')
      await move(cancelled.id, 'received', true)
      expect((await deliveryOf(cancelled.id))?.status).toBe('pending')

      const completed = await newDeliveryOrder()
      await move(completed.id, 'completed', true)
      expect((await deliveryOf(completed.id))?.status).toBe('delivered')
    })
  })
  describe('conta da mesa', () => {
    async function tableWithComanda() {
      const [table] = await db.insert(schema.restaurantTables).values({ establishmentId, number: 7, capacity: 4, status: 'occupied' }).returning()
      const [comanda] = await db.insert(schema.comandas).values({ establishmentId, tableId: table!.id, code: 'ABC234' }).returning()
      return { table: table!, comanda: comanda! }
    }

    function tableOrder(tableId: string) {
      return new CreateOrderUseCase(db, silentHub).execute({
        establishmentId,
        channel: 'manual',
        type: 'table',
        tableId,
        items: [{ productId, productName: 'Hot roll', unitPrice: 30, quantity: 2 }],
        priceFromCatalog: true,
      })
    }

    function settleUseCase() {
      const movements = new AddCashMovementUseCase(db)
      const deduct = new DeductStockForOrderUseCase(db)
      const status = new UpdateOrderStatusUseCase(
        db, silentHub, undefined, deduct, undefined, new RecordOrderPaymentsUseCase(db, movements), undefined, new RestoreStockForOrderUseCase(db)
      )
      const tables = new DrizzleTableRepository(db)
      const comandas = new DrizzleComandaRepository(db)
      const bill = new GetComandaBillUseCase(db)
      return {
        bill,
        settle: new SettleComandaUseCase(db, bill, movements, status, tables, comandas),
        close: new CloseComandaUseCase(tables, comandas, bill),
      }
    }

    it('pedido de mesa entra na comanda aberta; sem comanda o painel recusa', async () => {
      const [table] = await db.insert(schema.restaurantTables).values({ establishmentId, number: 3, capacity: 2 }).returning()
      await expect(tableOrder(table!.id)).rejects.toMatchObject({ code: 'table_comanda_required' })

      const { table: occupied, comanda } = await tableWithComanda()
      const order = await tableOrder(occupied.id)
      expect(order.comandaId).toBe(comanda.id)
    })

    it('receber a conta lança cada parte no caixa, conclui os pedidos e libera a mesa', async () => {
      const { table, comanda } = await tableWithComanda()
      const first = await tableOrder(table.id)
      const second = await tableOrder(table.id)
      const { bill, settle, close } = settleUseCase()

      const before = await bill.execute(comanda.id, establishmentId)
      expect(before.outstandingAmount).toBe(120)
      await expect(close.execute(comanda.id, establishmentId)).rejects.toBeInstanceOf(AppError)
      await expect(
        settle.execute({ comandaId: comanda.id, establishmentId, payments: [{ paymentTypeName: 'pix', amount: 120 }] })
      ).rejects.toMatchObject({ message: 'Abra o caixa antes de receber a conta' })

      await db.insert(schema.cashRegisters).values({ establishmentId, userId, openingAmount: '0' })
      await expect(
        settle.execute({ comandaId: comanda.id, establishmentId, payments: [{ paymentTypeName: 'pix', amount: 100 }] })
      ).rejects.toBeInstanceOf(AppError)

      const after = await settle.execute({
        comandaId: comanda.id,
        establishmentId,
        userId,
        payments: [
          { paymentTypeName: 'dinheiro', amount: 50, changeFor: 100, splitLabel: 'Pessoa 1' },
          { paymentTypeName: 'cartao_credito', amount: 70, splitLabel: 'Pessoa 2' },
        ],
      })
      expect(after.comanda.status).toBe('paid')
      expect(after.outstandingAmount).toBe(0)
      expect(after.orders.map((order) => order.status)).toEqual(['completed', 'completed'])

      const movements = await db.query.cashMovements.findMany({ where: eq(schema.cashMovements.type, 'payment') })
      expect(movements.reduce((sum, movement) => sum + Number(movement.amount), 0)).toBe(120)
      expect(movements.filter((movement) => movement.orderId === first.id).map((movement) => movement.paymentMethod).sort())
        .toEqual(['card_credit', 'cash'])
      expect(movements.filter((movement) => movement.orderId === second.id).map((movement) => Number(movement.amount)))
        .toEqual([60])

      const freed = await db.query.restaurantTables.findFirst({ where: eq(schema.restaurantTables.id, table.id) })
      expect(freed?.status).toBe('available')
      // Paga não volta a "não paga".
      await expect(close.execute(comanda.id, establishmentId)).rejects.toBeInstanceOf(AppError)
    })
  })
})
