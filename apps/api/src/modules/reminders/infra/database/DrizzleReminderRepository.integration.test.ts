import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'

import * as schema from '@/infra/database/schema'
import { runRecipeStockMigrations } from '@/infra/database/runRecipeStockMigrations'
import { DrizzleReminderRepository } from './DrizzleReminderRepository'

// As consultas dos lembretes rodam num Postgres de verdade: foi uma coluna que não existia mais
// (`orders.customer_phone`) que derrubou os crons. Sem TEST_DATABASE_URL o teste é pulado.
// Ex.: TEST_DATABASE_URL=postgres://postgres@localhost:5432/comandada_test bun test integration
const DATABASE_URL = process.env['TEST_DATABASE_URL']

const NOW = new Date('2026-11-15T14:00:00-03:00')
const daysAgo = (days: number, hour = 20): Date =>
  new Date(new Date(`2026-11-15T${String(hour).padStart(2, '0')}:00:00-03:00`).getTime() - days * 86_400_000)

describe.skipIf(!DATABASE_URL)('DrizzleReminderRepository (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let repository: DrizzleReminderRepository
  let establishmentId: string

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    await runRecipeStockMigrations({ db })
    await migrate(db, { migrationsFolder: path.join(import.meta.dir, '../../../../../drizzle/migrations') })
    repository = new DrizzleReminderRepository(db)
  })

  afterAll(async () => {
    await pool?.end()
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE establishments CASCADE`)
    const [establishment] = await db
      .insert(schema.establishments)
      .values({ name: 'Yuyaki' })
      .returning({ id: schema.establishments.id })
    establishmentId = establishment!.id
  })

  async function customerWithOrder(params: {
    number: string
    optIn: boolean | null
    orderedAt: Date
    status?: 'received' | 'cancelled'
    lastMarketingAt?: Date | null
    items?: Array<{ name: string; quantity: number }>
  }): Promise<string> {
    const [customer] = await db
      .insert(schema.customers)
      .values({
        establishmentId,
        name: `Cliente ${params.number}`,
        whatsappNumber: params.number,
        marketingOptIn: params.optIn,
        lastMarketingAt: params.lastMarketingAt ?? null,
      })
      .returning({ id: schema.customers.id })
    const [order] = await db
      .insert(schema.orders)
      .values({
        establishmentId,
        customerId: customer!.id,
        type: 'delivery',
        status: params.status ?? 'received',
        totalAmount: '50.00',
        createdAt: params.orderedAt,
      })
      .returning({ id: schema.orders.id })
    for (const item of params.items ?? []) {
      await db.insert(schema.orderItems).values({
        orderId: order!.id,
        productName: item.name,
        unitPrice: '10.00',
        quantity: item.quantity,
        totalPrice: '10.00',
      })
    }
    return customer!.id
  }

  it('acha quem aceitou novidades e pediu exatamente N dias atrás, com o item mais pedido', async () => {
    const expected = await customerWithOrder({
      number: '5516900000001',
      optIn: true,
      orderedAt: daysAgo(15),
      items: [
        { name: 'Ceviche Mix', quantity: 1 },
        { name: 'Temaki Salmão', quantity: 3 },
      ],
    })
    await customerWithOrder({ number: '5516900000002', optIn: false, orderedAt: daysAgo(15) })
    await customerWithOrder({ number: '5516900000003', optIn: null, orderedAt: daysAgo(15) })
    await customerWithOrder({ number: '5516900000004', optIn: true, orderedAt: daysAgo(14) })
    await customerWithOrder({ number: '5516900000005', optIn: true, orderedAt: daysAgo(15), status: 'cancelled' })
    await customerWithOrder({ number: '5516900000006', optIn: true, orderedAt: daysAgo(15), lastMarketingAt: daysAgo(3) })

    const candidates = await repository.findReorderCandidates({
      establishmentId,
      intervalDays: 15,
      minGapDays: 7,
      now: NOW,
      limit: 50,
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      customerId: expected,
      whatsappNumber: '5516900000001',
      topItem: 'Temaki Salmão',
      previousMarketingAt: null,
    })
  })

  it('usa o dia de Brasília: pedido às 22h (01h UTC do dia seguinte) conta no dia local', async () => {
    await customerWithOrder({ number: '5516900000007', optIn: true, orderedAt: daysAgo(15, 22) })
    const candidates = await repository.findReorderCandidates({
      establishmentId,
      intervalDays: 15,
      minGapDays: 7,
      now: NOW,
      limit: 50,
    })
    expect(candidates.map((candidate) => candidate.whatsappNumber)).toEqual(['5516900000007'])
  })

  it('marca o envio uma vez só e desfaz quando pedido', async () => {
    const customerId = await customerWithOrder({ number: '5516900000008', optIn: true, orderedAt: daysAgo(15) })

    expect(await repository.claimReorderReminder({ customerId, minGapDays: 7, now: NOW })).toBe(true)
    expect(await repository.claimReorderReminder({ customerId, minGapDays: 7, now: NOW })).toBe(false)

    await repository.releaseReorderReminder({ customerId, previousMarketingAt: null })
    expect(await repository.claimReorderReminder({ customerId, minGapDays: 7, now: NOW })).toBe(true)
  })

  it('lê as configurações do restaurante e acha a reserva pelo booking da agenda', async () => {
    await db.insert(schema.settings).values({ establishmentId, key: 'reminder_interval_days', value: 10 })
    expect(await repository.settingsFor(establishmentId)).toEqual({ reminder_interval_days: 10 })

    const [customer] = await db
      .insert(schema.customers)
      .values({ establishmentId, name: 'Ana Souza', whatsappNumber: '5516900000009' })
      .returning({ id: schema.customers.id })
    const bookingId = '22222222-2222-4222-8222-222222222222'
    await db.insert(schema.tableReservations).values({
      establishmentId,
      bookingId,
      customerId: customer!.id,
      code: 'RES-1234',
      partySize: 4,
      startsAt: new Date('2026-11-16T20:00:00-03:00'),
    })

    expect(await repository.findReservationByBooking({ establishmentId, bookingId })).toMatchObject({
      code: 'RES-1234',
      partySize: 4,
      customerName: 'Ana Souza',
      whatsappNumber: '5516900000009',
    })
    expect(
      await repository.findReservationByBooking({ establishmentId, bookingId: '33333333-3333-4333-8333-333333333333' })
    ).toBeNull()
  })
})
