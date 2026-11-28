import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { eq, sql } from 'drizzle-orm'
import { batches as stockBatches, deductions, levels as stockLevels, movements } from '@adatechnology/stock-module'
import { Pool } from 'pg'

import * as schema from '@/infra/database/schema'
import { runRecipeStockMigrations } from '@/infra/database/runRecipeStockMigrations'
import { createRecipeStockModules, type RecipeStockModules } from '@/infra/recipes/recipeStockModules'
import { GetIngredientsRankingUseCase } from '@/modules/reports/application/use-cases/GetIngredientsRankingUseCase'
import { DeductOrderStockUseCase } from './DeductOrderStockUseCase'
import { createStockEnabledChecks } from '@/infra/recipes/stockEnabled'
import { RestoreOrderStockUseCase } from './RestoreOrderStockUseCase'

// Baixa e devolução pelos módulos de ficha e estoque, e o relatório de insumos mais usados.
// Sem TEST_DATABASE_URL o teste é pulado. Ex.: TEST_DATABASE_URL=postgres://… bun test OrderStockSdk
const DATABASE_URL = process.env['TEST_DATABASE_URL']
const MIGRATIONS_FOLDER = path.join(import.meta.dir, '../../../../../drizzle/migrations')
const COPY_STATEMENTS = readFileSync(path.join(MIGRATIONS_FOLDER, '0061_recipe_stock_sdk.sql'), 'utf8').split('--> statement-breakpoint')

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000
const RANKING_DAYS = 30

describe.skipIf(!DATABASE_URL)('Baixa e devolução de estoque pelos módulos (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let modules: RecipeStockModules
  let deduct: DeductOrderStockUseCase
  let restore: RestoreOrderStockUseCase
  let establishmentId: string
  let flourId: string
  let eggId: string
  let cakeId: string
  let breadId: string
  let comboId: string

  async function resetTables(): Promise<void> {
    await db.execute(sql`TRUNCATE establishments CASCADE`)
    await db.execute(sql`TRUNCATE recipes.recipe_lines, recipes.recipes, recipes.ingredients, stock.movements, stock.batches, stock.levels, stock.deductions CASCADE`)
  }

  async function createProduct(name: string, extra: Partial<schema.NewProduct> = {}): Promise<string> {
    const [product] = await db
      .insert(schema.products)
      .values({ establishmentId, name, slug: name.toLowerCase(), price: '30', ...extra })
      .returning({ id: schema.products.id })
    return product!.id
  }

  async function createIngredient(params: { name: string; unit: 'kg' | 'un'; stock: string }): Promise<string> {
    const ingredient = await modules.recipeModule.useCases.createIngredient.execute({
      companyId: establishmentId,
      input: { name: params.name, unit: params.unit, costPerUnit: '10', supplier: null, notes: null },
    })
    await modules.stockModule.useCases.receiveBatch.execute({
      companyId: establishmentId,
      input: { ingredientId: ingredient.id, quantity: params.stock, batchCode: `L-${params.name}`, costPerUnit: '10', expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    })
    return ingredient.id
  }

  async function saveRecipe(productId: string, lines: { ingredientId: string; quantity: string; unit: 'kg' | 'un' }[]): Promise<void> {
    await modules.recipeModule.useCases.saveRecipe.execute({
      companyId: establishmentId,
      productId,
      input: { yieldPortions: '1', preparationTimeMinutes: null, instructions: '', lines: lines.map((line) => ({ ...line, notes: null })) },
    })
  }

  async function newOrder(items: { productId: string; quantity: number }[]) {
    const [order] = await db.insert(schema.orders).values({ establishmentId, channel: 'manual', type: 'pickup', totalAmount: '30' }).returning()
    const rows = await db
      .insert(schema.orderItems)
      .values(items.map((item) => ({ orderId: order!.id, productId: item.productId, productName: 'Item', unitPrice: '30', quantity: item.quantity, totalPrice: '30' })))
      .returning({ id: schema.orderItems.id })
    return { orderId: order!.id, itemIds: rows.map((row) => row.id) }
  }

  async function level(ingredientId: string): Promise<number> {
    const [row] = await db.select().from(stockLevels).where(eq(stockLevels.ingredientId, ingredientId))
    return Number(row!.quantity)
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    await runRecipeStockMigrations({ db })
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    modules = createRecipeStockModules({ database: db, isStockEnabled: () => true })
    deduct = new DeductOrderStockUseCase(db, modules.stockModule.useCases.deductOrder)
    restore = new RestoreOrderStockUseCase(db)
  })

  afterAll(async () => {
    await pool?.end()
  })

  beforeEach(async () => {
    await resetTables()
    const [establishment] = await db.insert(schema.establishments).values({ name: 'Demo' }).returning({ id: schema.establishments.id })
    establishmentId = establishment!.id
    flourId = await createIngredient({ name: 'Farinha', unit: 'kg', stock: '10' })
    eggId = await createIngredient({ name: 'Ovo', unit: 'un', stock: '50' })
    cakeId = await createProduct('Bolo')
    breadId = await createProduct('Pao')
    comboId = await createProduct('Combo', { isKit: true })
    await saveRecipe(cakeId, [
      { ingredientId: flourId, quantity: '0.2', unit: 'kg' },
      { ingredientId: eggId, quantity: '2', unit: 'un' },
    ])
    await saveRecipe(breadId, [{ ingredientId: flourId, quantity: '0.1', unit: 'kg' }])
    await db.insert(schema.productComponents).values([
      { kitProductId: comboId, componentProductId: cakeId, quantity: 1 },
      { kitProductId: comboId, componentProductId: breadId, quantity: 2 },
    ])
  })

  describe('baixa', () => {
    it('combo baixa os insumos dos componentes somados, sob uma única chave por item do pedido', async () => {
      const { orderId, itemIds } = await newOrder([{ productId: comboId, quantity: 3 }])

      const result = await deduct.execute({ orderId, establishmentId })

      expect(result?.lines).toEqual([{ lineKey: itemIds[0]!, status: 'applied', movementCount: 2 }])
      // 3 combos x (1 bolo + 2 pães) = 3 x (0,2 + 0,2) kg de farinha e 3 x 2 ovos.
      expect(await level(flourId)).toBeCloseTo(10 - 1.2, 4)
      expect(await level(eggId)).toBe(50 - 6)

      const expectedKey = `order:${orderId}:${itemIds[0]}`
      const keys = await db.select({ sourceKey: movements.sourceKey }).from(movements).where(eq(movements.kind, 'out'))
      expect(new Set(keys.map((row) => row.sourceKey))).toEqual(new Set([expectedKey]))
      const markers = await db.select().from(deductions)
      expect(markers.map((marker) => marker.sourceKey)).toEqual([expectedKey])
    })

    it('voltar e avançar o status baixa uma vez só', async () => {
      const { orderId } = await newOrder([{ productId: cakeId, quantity: 2 }])

      await deduct.execute({ orderId, establishmentId })
      await deduct.execute({ orderId, establishmentId })
      const third = await deduct.execute({ orderId, establishmentId })

      expect(third?.lines[0]?.status).toBe('already_applied')
      expect(await level(flourId)).toBeCloseTo(10 - 0.4, 4)
      expect(await level(eggId)).toBe(46)
    })

    it('dois pedidos do mesmo insumo ao mesmo tempo somam certo, e o mesmo pedido em dobro baixa uma vez', async () => {
      const first = await newOrder([{ productId: cakeId, quantity: 1 }])
      const second = await newOrder([{ productId: cakeId, quantity: 1 }])

      await Promise.all([
        deduct.execute({ orderId: first.orderId, establishmentId }),
        deduct.execute({ orderId: second.orderId, establishmentId }),
        deduct.execute({ orderId: first.orderId, establishmentId }),
        deduct.execute({ orderId: second.orderId, establishmentId }),
      ])

      expect(await level(flourId)).toBeCloseTo(10 - 0.4, 4)
      expect(await level(eggId)).toBe(46)
      const markers = await db.select().from(deductions)
      expect(markers).toHaveLength(2)
    })
  })

  describe('cancelamento', () => {
    it('devolve ao lote e ao saldo o que o combo baixou, uma vez só, e produzir de novo baixa de novo', async () => {
      const { orderId } = await newOrder([{ productId: comboId, quantity: 3 }])
      await deduct.execute({ orderId, establishmentId })

      const first = await restore.execute({ orderId, establishmentId })
      const second = await restore.execute({ orderId, establishmentId })

      expect(first.movementsCreated).toBe(2)
      expect(second.movementsCreated).toBe(0)
      expect(await level(flourId)).toBeCloseTo(10, 4)
      expect(await level(eggId)).toBe(50)
      const batchRows = await db.select().from(stockBatches)
      expect(batchRows.map((batch) => Number(batch.remainingQuantity)).sort((left, right) => left - right)).toEqual([10, 50])
      expect(await db.select().from(deductions)).toHaveLength(0)

      await deduct.execute({ orderId, establishmentId })
      expect(await level(flourId)).toBeCloseTo(10 - 1.2, 4)
    })

    it('devolve também a baixa migrada da tabela antiga (chave order:<pedido>:legacy)', async () => {
      const { orderId } = await newOrder([{ productId: cakeId, quantity: 2 }])
      await deduct.execute({ orderId, establishmentId })
      await db.update(movements).set({ sourceKey: `order:${orderId}:legacy` }).where(eq(movements.kind, 'out'))

      const result = await restore.execute({ orderId, establishmentId })

      expect(result.movementsCreated).toBe(2)
      expect(await level(flourId)).toBeCloseTo(10, 4)
      expect(await level(eggId)).toBe(50)
    })

    it('saldo que ficou negativo (sem lote) volta só para o saldo', async () => {
      const { orderId } = await newOrder([{ productId: breadId, quantity: 120 }])
      await deduct.execute({ orderId, establishmentId })
      expect(await level(flourId)).toBeCloseTo(-2, 4)

      await restore.execute({ orderId, establishmentId })

      expect(await level(flourId)).toBeCloseTo(10, 4)
      const [batch] = await db.select().from(stockBatches).where(eq(stockBatches.ingredientId, flourId))
      expect(Number(batch!.remainingQuantity)).toBe(10)
    })
  })

  describe('baixa e devolução cruzadas', () => {
    it('sem baixa valendo, a devolução ainda apaga as marcas para o pedido reaberto baixar', async () => {
      const { orderId, itemIds } = await newOrder([{ productId: cakeId, quantity: 2 }])
      await db.insert(deductions).values({ companyId: establishmentId, sourceKey: `order:${orderId}:${itemIds[0]}` })

      const result = await restore.execute({ orderId, establishmentId })

      expect(result.movementsCreated).toBe(0)
      expect(await db.select().from(deductions)).toHaveLength(0)
      await deduct.execute({ orderId, establishmentId })
      expect(await level(flourId)).toBeCloseTo(10 - 0.4, 4)
    })

    it('não baixa pedido cancelado enquanto o chamador ainda via o status antigo', async () => {
      const { orderId } = await newOrder([{ productId: cakeId, quantity: 2 }])
      await db.update(schema.orders).set({ status: 'cancelled' }).where(eq(schema.orders.id, orderId))

      const result = await deduct.execute({ orderId, establishmentId, observedStatus: 'received' })

      expect(result).toBeUndefined()
      expect(await level(flourId)).toBe(10)
      expect(await db.select().from(deductions)).toHaveLength(0)
    })

    it('baixa e devolução simultâneas terminam coerentes: saldo e marcas concordam', async () => {
      for (let round = 0; round < 5; round++) {
        await resetTables()
        const [establishment] = await db.insert(schema.establishments).values({ name: 'Demo' }).returning({ id: schema.establishments.id })
        establishmentId = establishment!.id
        flourId = await createIngredient({ name: 'Farinha', unit: 'kg', stock: '10' })
        cakeId = await createProduct('Bolo')
        await saveRecipe(cakeId, [{ ingredientId: flourId, quantity: '0.2', unit: 'kg' }])
        const { orderId } = await newOrder([{ productId: cakeId, quantity: 2 }])
        await deduct.execute({ orderId, establishmentId })

        await Promise.all([restore.execute({ orderId, establishmentId }), deduct.execute({ orderId, establishmentId })])

        const markers = (await db.select().from(deductions)).length
        // Devolveu e baixou de novo (marca e saldo baixado) ou só devolveu (sem marca e saldo cheio): nunca meio a meio.
        if (markers === 0) expect(await level(flourId)).toBeCloseTo(10, 4)
        else expect(await level(flourId)).toBeCloseTo(10 - 0.4, 4)
      }
    })
  })

  describe('estoque ligado por padrão', () => {
    it('saldo diferente de zero sem lote nem movimento conta como estoque em uso', async () => {
      await db.delete(movements)
      await db.delete(stockBatches)
      const checks = createStockEnabledChecks(db)
      expect(await checks.isStockEnabledForCompany(establishmentId)).toBe(true)

      await db.update(stockLevels).set({ quantity: '0' })
      expect(await checks.isStockEnabledForCompany(establishmentId)).toBe(false)
    })
  })

  describe('relatório de insumos mais usados', () => {
    it('dá os mesmos números da consulta antiga sobre a mesma massa, depois da cópia para os módulos', async () => {
      await resetTables()
      const [establishment] = await db.insert(schema.establishments).values({ name: 'Parity' }).returning({ id: schema.establishments.id })
      const parityId = establishment!.id
      const [rice, beans, oil] = await db
        .insert(schema.ingredients)
        .values([
          { establishmentId: parityId, name: 'Arroz', unit: 'kg', stockQuantity: '20' },
          { establishmentId: parityId, name: 'Feijão', unit: 'kg', stockQuantity: '20' },
          { establishmentId: parityId, name: 'Óleo', unit: 'l', stockQuantity: '20' },
        ])
        .returning({ id: schema.ingredients.id })
      const orders = await db
        .insert(schema.orders)
        .values([
          { establishmentId: parityId, type: 'delivery', totalAmount: '30' },
          { establishmentId: parityId, type: 'delivery', totalAmount: '30' },
        ])
        .returning({ id: schema.orders.id })
      const recent = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR_IN_MILLISECONDS)
      await db.insert(schema.stockMovements).values([
        { establishmentId: parityId, ingredientId: rice!.id, orderId: orders[0]!.id, movementType: 'out', quantity: '1.2500', createdAt: recent(5) },
        { establishmentId: parityId, ingredientId: rice!.id, orderId: orders[1]!.id, movementType: 'out', quantity: '0.7500', createdAt: recent(4) },
        { establishmentId: parityId, ingredientId: rice!.id, orderId: orders[1]!.id, movementType: 'return', quantity: '0.7500', createdAt: recent(3) },
        { establishmentId: parityId, ingredientId: beans!.id, orderId: orders[0]!.id, movementType: 'out', quantity: '3.3333', createdAt: recent(5) },
        { establishmentId: parityId, ingredientId: beans!.id, orderId: orders[1]!.id, movementType: 'out', quantity: '0.0049', createdAt: recent(2) },
        { establishmentId: parityId, ingredientId: oil!.id, orderId: orders[0]!.id, movementType: 'out', quantity: '0.4000', createdAt: recent(5) },
        { establishmentId: parityId, ingredientId: oil!.id, orderId: orders[0]!.id, movementType: 'return', quantity: '0.4000', createdAt: recent(4) },
        // fora da janela e de outro tipo: não entram
        { establishmentId: parityId, ingredientId: rice!.id, movementType: 'out', quantity: '9', createdAt: recent((RANKING_DAYS + 5) * 24) },
        { establishmentId: parityId, ingredientId: rice!.id, movementType: 'adjustment', quantity: '-4', reason: 'Recontagem', createdAt: recent(1) },
      ])

      const oldQuery = await db.execute(sql`
        SELECT i.id AS "ingredientId", i.name AS "ingredientName",
               ROUND(SUM(CASE WHEN m.movement_type = 'return' THEN -m.quantity ELSE m.quantity END)::numeric, 2) AS "totalQuantityUsed",
               CAST(COUNT(*) FILTER (WHERE m.movement_type = 'out') AS INTEGER) AS "movementCount"
        FROM stock_movements m
        INNER JOIN ingredients i ON m.ingredient_id = i.id
        WHERE m.establishment_id = ${parityId}
          AND m.movement_type IN ('out', 'return')
          AND m.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY i.id, i.name
        HAVING SUM(CASE WHEN m.movement_type = 'return' THEN -m.quantity ELSE m.quantity END) > 0
        ORDER BY SUM(CASE WHEN m.movement_type = 'return' THEN -m.quantity ELSE m.quantity END) DESC
        LIMIT 10`)

      for (const statement of COPY_STATEMENTS) await db.execute(sql.raw(statement))
      const ranking = await new GetIngredientsRankingUseCase(db).execute({ establishmentId: parityId, days: RANKING_DAYS })

      expect(ranking.topIngredients.length).toBeGreaterThan(0)
      expect(ranking.topIngredients).toEqual(
        oldQuery.rows.map((row) => ({
          ingredientId: row['ingredientId'] as string,
          ingredientName: row['ingredientName'] as string,
          totalQuantityUsed: row['totalQuantityUsed'] as string,
          movementCount: row['movementCount'] as number,
        }))
      )
    })
  })
})
