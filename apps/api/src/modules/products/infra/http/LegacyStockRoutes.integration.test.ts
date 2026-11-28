import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { eq, sql } from 'drizzle-orm'
import { levels as stockLevels } from '@adatechnology/stock-module'
import { Pool } from 'pg'

import * as schema from '@/infra/database/schema'
import { runRecipeStockMigrations } from '@/infra/database/runRecipeStockMigrations'
import type { ParsedRequest, ResponseHelper, RouteHandler } from '@/infra/http/router'
import { createRecipeStockModules, type RecipeStockModules } from '@/infra/recipes/recipeStockModules'
import { reconcilePreparationMirror } from '@/infra/recipes/preparationMirror'
import { createStockEnabledChecks } from '@/infra/recipes/stockEnabled'
import { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { CreateStockBatchUseCase } from '../../application/use-cases/CreateStockBatchUseCase'
import { CreateStockMovementUseCase } from '../../application/use-cases/CreateStockMovementUseCase'
import { DeductOrderStockUseCase } from '../../application/use-cases/DeductOrderStockUseCase'
import { RestoreOrderStockUseCase } from '../../application/use-cases/RestoreOrderStockUseCase'
import { IngredientController } from './IngredientController'
import { StockBatchController } from './StockBatchController'
import { StockMovementController } from './StockMovementController'

// As rotas antigas de insumo e estoque são adaptadores dos módulos: o painel atual lê o mesmo formato.
// Sem TEST_DATABASE_URL o teste é pulado. Ex.: TEST_DATABASE_URL=postgres://… bun test LegacyStockRoutes
const DATABASE_URL = process.env['TEST_DATABASE_URL']
const MIGRATIONS_FOLDER = path.join(import.meta.dir, '../../../../../drizzle/migrations')
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

type CapturedResponse = { status: number; body: unknown }

describe.skipIf(!DATABASE_URL)('Rotas antigas de insumo e estoque sobre os módulos (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let modules: RecipeStockModules
  let ingredients: IngredientController
  let batches: StockBatchController
  let stockMovements: StockMovementController
  let establishmentId: string
  let userId: string
  let productId: string

  async function call(handler: RouteHandler, overrides: Partial<ParsedRequest> = {}): Promise<CapturedResponse> {
    const captured: CapturedResponse = { status: 0, body: undefined }
    const response = {
      json(data: unknown, statusCode = 200) {
        captured.status = statusCode
        captured.body = data
      },
      error() {
        captured.status = 500
      },
      binary() {},
      sent: false,
      requestId: 'test',
    } as unknown as ResponseHelper
    const request: ParsedRequest = {
      method: 'GET',
      url: '/',
      params: {},
      query: {},
      headers: {},
      body: undefined,
      rawBody: Buffer.alloc(0),
      user: { id: userId, establishmentId, email: 'a@test', name: 'Ana', role: 'Gerente', permissions: [] },
      ...overrides,
    }
    await handler(request, response)
    return captured
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    await runRecipeStockMigrations({ db })
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    const checks = createStockEnabledChecks(db)
    modules = createRecipeStockModules({ database: db, isStockEnabled: checks.isStockEnabledForCompany })
    const createAuditLogUseCase = new CreateAuditLogUseCase(db)
    const ensureStockEnabled = checks.ensureStockEnabledForCompany
    ingredients = new IngredientController({ db, recipes: modules.recipeModule, stock: modules.stockModule, ensureStockEnabled })
    batches = new StockBatchController(
      db,
      new CreateStockBatchUseCase({ db, recipes: modules.recipeModule, stock: modules.stockModule, createAuditLogUseCase, ensureStockEnabled }),
      modules.recipeModule
    )
    stockMovements = new StockMovementController(
      db,
      new CreateStockMovementUseCase({ db, stock: modules.stockModule, createAuditLogUseCase, ensureStockEnabled })
    )
  })

  afterAll(async () => {
    await pool?.end()
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE establishments CASCADE`)
    await db.execute(sql`TRUNCATE recipes.recipe_lines, recipes.recipes, recipes.ingredients, stock.movements, stock.batches, stock.levels, stock.deductions CASCADE`)
    const [establishment] = await db.insert(schema.establishments).values({ name: 'Demo' }).returning({ id: schema.establishments.id })
    establishmentId = establishment!.id
    const [role] = await db.insert(schema.roles).values({ establishmentId, name: 'Gerente' }).returning()
    const [user] = await db
      .insert(schema.users)
      .values({ establishmentId, roleId: role!.id, name: 'Ana', email: `ana-${Date.now()}@demo.test`, passwordHash: 'x' })
      .returning()
    userId = user!.id
    const [product] = await db.insert(schema.products).values({ establishmentId, name: 'Bolo', slug: 'bolo', price: '30' }).returning({ id: schema.products.id })
    productId = product!.id
  })

  async function createFlour(): Promise<string> {
    const created = await call(ingredients.create, { body: { name: 'Farinha', unit: 'kg', costPerUnit: 4, minimumStock: 2 } })
    expect(created.status).toBe(201)
    return (created.body as { id: string }).id
  }

  it('cria insumo e lote, mexe no estoque e lê no formato que o painel espera', async () => {
    const flourId = await createFlour()

    const batch = await call(batches.create, {
      body: { ingredientId: flourId, batchNumber: 'L1', quantity: 10, costPerUnit: 6, expiresAt: new Date(Date.now() + 10 * DAY_IN_MILLISECONDS).toISOString() },
    })
    expect(batch.status).toBe(201)
    expect(batch.body).toMatchObject({ ingredientId: flourId, batchNumber: 'L1', quantity: '10.0000', remainingQuantity: '10.0000' })

    await call(stockMovements.create, { body: { ingredientId: flourId, movementType: 'loss', quantity: 1.5, reason: 'Caiu no chão' } })
    const adjustment = await call(stockMovements.create, { body: { ingredientId: flourId, movementType: 'adjustment', direction: 'increase', quantity: 0.5, reason: 'Recontagem' } })
    expect(adjustment.body).toMatchObject({ movementType: 'adjustment', quantity: '0.5000', stockQuantityAfter: '9.0000' })

    const list = await call(ingredients.list)
    expect(list.body).toEqual([
      expect.objectContaining({ id: flourId, name: 'Farinha', unit: 'kg', stockQuantity: '9.0000', minimumStock: '2.0000', sectionId: null }),
    ])
    // Custo médio ponderado: saldo 0 e entrada de 10 a 6 leva o custo a 6.
    expect((list.body as { costPerUnit: string }[])[0]!.costPerUnit).toBe('6.0000')

    const history = await call(stockMovements.listByIngredient, { query: { ingredientId: flourId } })
    const entries = (history.body as { data: { movementType: string; quantity: string; userName: string | null }[] }).data
    expect(entries.map((entry) => entry.movementType).sort()).toEqual(['adjustment', 'in', 'loss'])
    expect(entries.find((entry) => entry.movementType === 'loss')).toMatchObject({ quantity: '-1.5000', userName: 'Ana' })

    const lossOnly = await call(stockMovements.listByIngredient, { query: { ingredientId: flourId, movementType: 'loss' } })
    expect((lossOnly.body as { total: number }).total).toBe(1)

    const expiring = await call(batches.listExpiring, { query: { days: '30' } })
    expect(expiring.body).toEqual([expect.objectContaining({ ingredientId: flourId, ingredientName: 'Farinha', batchNumber: 'L1' })])
    expect((await call(batches.countExpiring)).body).toEqual({ count: 0, alertDays: 7 })
  })

  it('ficha do produto: adiciona, lista, recusa duplicado e remove a linha', async () => {
    const flourId = await createFlour()

    const added = await call(ingredients.addToProduct, { params: { productId }, body: { ingredientId: flourId, quantity: 0.25, unit: 'kg' } })
    expect(added.status).toBe(201)
    const lineId = (added.body as { id: string }).id
    expect(added.body).toMatchObject({ productId, ingredientId: flourId, quantity: '0.2500', unit: 'kg' })

    expect((await call(ingredients.listByProduct, { params: { productId } })).body).toHaveLength(1)
    await expect(call(ingredients.addToProduct, { params: { productId }, body: { ingredientId: flourId, quantity: 1 } })).rejects.toThrow()

    await call(ingredients.removeFromProduct, { params: { productId, id: lineId } })
    expect((await call(ingredients.listByProduct, { params: { productId } })).body).toEqual([])
  })

  it('a primeira escrita liga o estoque, e `stock.enabled = false` o mantém desligado', async () => {
    const flourId = await createFlour()
    const [enabled] = await db.select().from(schema.settings).where(eq(schema.settings.establishmentId, establishmentId))
    expect(enabled).toMatchObject({ key: 'stock.enabled', value: true })

    await db.update(schema.settings).set({ value: false }).where(eq(schema.settings.establishmentId, establishmentId))
    const newBatch = { ingredientId: flourId, batchNumber: 'L1', quantity: 1, costPerUnit: 1, expiresAt: new Date(Date.now() + DAY_IN_MILLISECONDS).toISOString() }
    await expect(call(batches.create, { body: newBatch })).rejects.toThrow()
    expect(await db.select().from(stockLevels).where(eq(stockLevels.ingredientId, flourId))).toHaveLength(1)
  })

  it('o tempo de preparo da ficha é espelhado no produto, e a reconciliação refaz só o que diverge', async () => {
    const flourId = await createFlour()
    await modules.recipeModule.useCases.saveRecipe.execute({
      companyId: establishmentId,
      productId,
      input: { yieldPortions: '1', preparationTimeMinutes: 25, instructions: 'Assar', lines: [{ ingredientId: flourId, quantity: '1', unit: 'kg', notes: null }] },
    })
    const readProduct = async () => (await db.select().from(schema.products).where(eq(schema.products.id, productId)))[0]!
    expect(await readProduct()).toMatchObject({ preparationTimeMinutes: 25, preparationInstructions: 'Assar' })

    await db.update(schema.products).set({ preparationTimeMinutes: 99 }).where(eq(schema.products.id, productId))
    expect(await reconcilePreparationMirror(db)).toBe(1)
    expect(await readProduct()).toMatchObject({ preparationTimeMinutes: 25, preparationInstructions: 'Assar' })
    expect(await reconcilePreparationMirror(db)).toBe(0)

    await modules.recipeModule.useCases.removeRecipe.execute({ companyId: establishmentId, productId })
    expect(await readProduct()).toMatchObject({ preparationTimeMinutes: null, preparationInstructions: null })
  })

  it('a varredura de validade avisa só dentro da janela de cada restaurante', async () => {
    const flourId = await createFlour()
    await call(batches.create, { body: { ingredientId: flourId, batchNumber: 'PERTO', quantity: 1, costPerUnit: 1, expiresAt: new Date(Date.now() + 3 * DAY_IN_MILLISECONDS).toISOString() } })
    await call(batches.create, { body: { ingredientId: flourId, batchNumber: 'LONGE', quantity: 1, costPerUnit: 1, expiresAt: new Date(Date.now() + 20 * DAY_IN_MILLISECONDS).toISOString() } })
    await db.insert(schema.settings).values({ establishmentId, key: 'stock', value: { expiry_alert_days: 10 } })

    await modules.stockModule.useCases.scanExpiringBatches.execute({ withinDays: 30 })

    const alerts = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'stock_expiry_alert'))
    expect(alerts.map((alert) => (alert.metadata as { batchNumber: string }).batchNumber)).toEqual(['PERTO'])
  })

  it('a baixa de pedido aparece no histórico antigo como saída com o pedido, e a devolução como devolução', async () => {
    const flourId = await createFlour()
    await call(batches.create, { body: { ingredientId: flourId, batchNumber: 'L1', quantity: 10, costPerUnit: 4, expiresAt: new Date(Date.now() + 5 * DAY_IN_MILLISECONDS).toISOString() } })
    await modules.recipeModule.useCases.saveRecipe.execute({
      companyId: establishmentId,
      productId,
      input: { yieldPortions: '1', preparationTimeMinutes: null, instructions: '', lines: [{ ingredientId: flourId, quantity: '1', unit: 'kg', notes: null }] },
    })
    const [order] = await db.insert(schema.orders).values({ establishmentId, channel: 'manual', type: 'pickup', totalAmount: '30' }).returning()
    await db.insert(schema.orderItems).values({ orderId: order!.id, productId, productName: 'Bolo', unitPrice: '30', quantity: 2, totalPrice: '60' })
    await new DeductOrderStockUseCase(db, modules.stockModule.useCases.deductOrder).execute({ orderId: order!.id, establishmentId, userId })
    await new RestoreOrderStockUseCase(db).execute({ orderId: order!.id, establishmentId, userId })

    const history = await call(stockMovements.listByIngredient, { query: { ingredientId: flourId } })
    const entries = (history.body as { data: { movementType: string; quantity: string; orderId: string | null }[] }).data
    expect(entries.find((entry) => entry.movementType === 'out')).toMatchObject({ quantity: '2.0000', orderId: order!.id })
    expect(entries.find((entry) => entry.movementType === 'return')).toMatchObject({ quantity: '2.0000', orderId: order!.id })
  })
})
