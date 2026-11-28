import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { createExpenseModule, runExpenseMigrations, type ExpenseModule } from '@adatechnology/expense-module'

import * as schema from '@/infra/database/schema'
import { runRecipeStockMigrations } from '@/infra/database/runRecipeStockMigrations'
import { importLegacyMonthlyAccounts, legacyMarker } from './importLegacyMonthlyAccounts'

// As "Contas fixas" antigas passam para o módulo de contas a pagar do SDK uma vez, sem apagar nada.
// Sem TEST_DATABASE_URL o teste é pulado. Ex.: TEST_DATABASE_URL=postgres://… bun test integration
const DATABASE_URL = process.env['TEST_DATABASE_URL']

describe.skipIf(!DATABASE_URL)('importLegacyMonthlyAccounts (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let module: ExpenseModule
  let establishmentId: string

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    await runRecipeStockMigrations({ db })
    await migrate(db, { migrationsFolder: path.join(import.meta.dir, '../../../../drizzle/migrations') })
    await runExpenseMigrations({ db, migrate })
    module = createExpenseModule({ db, clock: { today: () => '2026-11-20' } })
  })

  afterAll(async () => {
    await pool?.end()
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE establishments CASCADE`)
    await db.execute(sql`TRUNCATE expense.expenses, expense.categories CASCADE`)
    const [establishment] = await db
      .insert(schema.establishments)
      .values({ name: 'Yuyaki' })
      .returning({ id: schema.establishments.id })
    establishmentId = establishment!.id
  })

  it('copia a conta com categoria, valor, vencimento e o pagamento do mês, e não duplica na segunda vez', async () => {
    const [rent] = await db
      .insert(schema.monthlyAccounts)
      .values({
        establishmentId,
        description: 'Aluguel da loja',
        category: 'aluguel',
        amount: '3500.00',
        dueDay: 10,
        status: 'paid',
        paidAt: new Date('2026-11-09T15:00:00Z'),
        createdAt: new Date('2026-11-01T12:00:00Z'),
      })
      .returning({ id: schema.monthlyAccounts.id })
    await db.insert(schema.monthlyAccounts).values({
      establishmentId,
      description: 'Contador',
      category: 'categoria-que-nao-existe',
      amount: '450.00',
      dueDay: 31,
      recurrence: 'weekly',
      createdAt: new Date('2026-11-01T12:00:00Z'),
    })

    expect(await importLegacyMonthlyAccounts({ database: db, module })).toEqual({ imported: 2 })
    expect(await importLegacyMonthlyAccounts({ database: db, module })).toEqual({ imported: 0 })

    const list = await module.expenses.listExpenses({ companyId: establishmentId })
    expect(list).toHaveLength(2)
    const imported = list.find((item) => item.name === 'Aluguel da loja')!
    expect(imported.notes).toContain(legacyMarker(rent!.id))
    expect(imported.recurrence).toBe('monthly')

    const november = await module.expenses.listOccurrences({
      companyId: establishmentId,
      from: '2026-11-01',
      to: '2026-11-30',
    })
    const rentOccurrence = november.find((item) => item.expenseId === imported.id)!
    expect(rentOccurrence.status).toBe('paid')
    expect(rentOccurrence.paidAmount).toBe('3500.00')
    const accountant = november.find((item) => item.expenseId !== imported.id)!
    expect(accountant.status).toBe('open')
    expect(accountant.dueDate).toBe('2026-11-30')
    expect(accountant.categoryName).toBe('Outros')
  })
})
