import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'

import * as schema from '@/infra/database/schema'
import { runRecipeStockMigrations } from './runRecipeStockMigrations'

// A migration 0061 copia insumos, fichas, saldos, lotes e movimentos para os schemas do SDK.
// Sem TEST_DATABASE_URL o teste é pulado. Ex.: TEST_DATABASE_URL=postgres://… bun test recipeStockSdkCopy
const DATABASE_URL = process.env['TEST_DATABASE_URL']
const MIGRATIONS_FOLDER = path.join(import.meta.dir, '../../../drizzle/migrations')
const COPY_STATEMENTS = readFileSync(path.join(MIGRATIONS_FOLDER, '0061_recipe_stock_sdk.sql'), 'utf8').split('--> statement-breakpoint')

describe.skipIf(!DATABASE_URL)('0061_recipe_stock_sdk (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let establishmentId: string

  async function runCopy(): Promise<void> {
    for (const statement of COPY_STATEMENTS) await db.execute(sql.raw(statement))
  }

  async function count(table: string): Promise<number> {
    const result = await db.execute(sql.raw(`SELECT count(*)::int AS total FROM ${table}`))
    return Number((result.rows[0] as { total: number }).total)
  }

  async function countAll(): Promise<number[]> {
    return [await count('recipes.ingredients'), await count('recipes.recipe_lines'), await count('stock.movements'), await count('stock.deductions')]
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    await runRecipeStockMigrations({ db })
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  })

  afterAll(async () => {
    await pool?.end()
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE establishments CASCADE`)
    await db.execute(sql`TRUNCATE recipes.recipe_lines, recipes.recipes, recipes.ingredients, stock.movements, stock.batches, stock.levels, stock.deductions CASCADE`)
    const [establishment] = await db.insert(schema.establishments).values({ name: 'Demo' }).returning({ id: schema.establishments.id })
    establishmentId = establishment!.id
  })

  it('copia com a unidade certa, baixa só pedidos com consumo valendo e não duplica na segunda vez', async () => {
    const [flour, egg] = await db
      .insert(schema.ingredients)
      .values([
        { establishmentId, name: 'Farinha', unit: 'kg', costPerUnit: '5', stockQuantity: '20', minimumStock: '2' },
        { establishmentId, name: 'Ovo', unit: 'kg', costPerUnit: '12', stockQuantity: '8' },
      ])
      .returning({ id: schema.ingredients.id })
    const [cake] = await db
      .insert(schema.products)
      .values({ establishmentId, name: 'Bolo', slug: 'bolo', price: '30', preparationTimeMinutes: 40 })
      .returning({ id: schema.products.id })
    await db.insert(schema.productIngredients).values([
      { productId: cake!.id, ingredientId: flour!.id, quantity: '300', unit: 'g' },
      { productId: cake!.id, ingredientId: egg!.id, quantity: '3', unit: 'un' },
    ])
    const [activeOrder, returnedOrder] = await db
      .insert(schema.orders)
      .values([
        { establishmentId, type: 'delivery', totalAmount: '30' },
        { establishmentId, type: 'delivery', totalAmount: '30' },
      ])
      .returning({ id: schema.orders.id })
    await db.insert(schema.orderItems).values([
      { orderId: activeOrder!.id, productId: cake!.id, productName: 'Bolo', unitPrice: '30', quantity: 1, totalPrice: '30' },
      { orderId: returnedOrder!.id, productId: cake!.id, productName: 'Bolo', unitPrice: '30', quantity: 1, totalPrice: '30' },
    ])
    await db.insert(schema.stockMovements).values([
      { establishmentId, ingredientId: flour!.id, orderId: activeOrder!.id, movementType: 'out', quantity: '0.3', createdAt: new Date('2026-11-01T10:00:00Z') },
      { establishmentId, ingredientId: flour!.id, orderId: returnedOrder!.id, movementType: 'out', quantity: '0.3', createdAt: new Date('2026-11-01T10:00:00Z') },
      { establishmentId, ingredientId: flour!.id, orderId: returnedOrder!.id, movementType: 'return', quantity: '0.3', createdAt: new Date('2026-11-01T11:00:00Z') },
      { establishmentId, ingredientId: flour!.id, movementType: 'adjustment', quantity: '-1.5', reason: 'Recontagem' },
      { establishmentId, ingredientId: flour!.id, movementType: 'adjustment', quantity: '0', reason: 'Zero' },
    ])

    await runCopy()

    const lines = await db.execute(sql`SELECT unit FROM recipes.recipe_lines ORDER BY position`)
    expect(lines.rows.map((row) => row['unit']).sort()).toEqual(['g', 'kg'])
    const kinds = await db.execute(sql`SELECT kind, delta::float AS delta FROM stock.movements ORDER BY kind, delta`)
    expect(kinds.rows).toEqual([
      { kind: 'adjust', delta: -1.5 },
      { kind: 'in', delta: 0.3 },
      { kind: 'out', delta: -0.3 },
      { kind: 'out', delta: -0.3 },
    ])
    expect(await count('stock.deductions')).toBe(1)
    expect(await count('stock.levels')).toBe(2)

    const before = await countAll()
    await runCopy()
    expect(await countAll()).toEqual(before)
  })
})
