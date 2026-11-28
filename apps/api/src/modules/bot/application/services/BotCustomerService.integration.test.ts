import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import path from 'path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { eq, sql } from 'drizzle-orm'
import { Pool } from 'pg'

import * as schema from '@/infra/database/schema'
import { runRecipeStockMigrations } from '@/infra/database/runRecipeStockMigrations'
import { DrizzleConversationContactNamesReader } from '@/modules/conversations/application/services/ConversationContactNames'
import { BotCustomerService } from './BotCustomerService'

// Nome do perfil do WhatsApp gravado no cliente e lido pela lista de conversas, num Postgres de verdade.
// Sem TEST_DATABASE_URL o teste é pulado.
const DATABASE_URL = process.env['TEST_DATABASE_URL']
const NUMBER = '5516991042201'

describe.skipIf(!DATABASE_URL)('BotCustomerService.recordProfileName (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let service: BotCustomerService
  let establishmentId: string

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = drizzle(pool, { schema })
    await runRecipeStockMigrations({ db })
    await migrate(db, { migrationsFolder: path.join(import.meta.dir, '../../../../../drizzle/migrations') })
    service = new BotCustomerService(db)
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

  const record = (profileName: string) => service.recordProfileName({ establishmentId, whatsappNumber: NUMBER, profileName })

  it('primeira mensagem cria o cliente com o nome do perfil', async () => {
    const customer = await record('ana clara')
    expect(customer).toMatchObject({ name: 'Ana Clara', whatsappProfileName: 'ana clara', whatsappNumber: NUMBER })
  })

  it('perfil que o bot não aceita como nome fica só no perfil', async () => {
    const customer = await record('Zé 🍣')
    expect(customer).toMatchObject({ name: NUMBER, whatsappProfileName: 'Zé 🍣' })
  })

  it('cliente antigo com o número no nome ganha o nome do perfil', async () => {
    await db.insert(schema.customers).values({ establishmentId, name: NUMBER, whatsappNumber: NUMBER })
    expect(await record('Bruno')).toMatchObject({ name: 'Bruno', whatsappProfileName: 'Bruno' })
  })

  it('nome digitado ao bot ou corrigido pela equipe não é trocado', async () => {
    await db.insert(schema.customers).values({ establishmentId, name: 'Bruno Silva', whatsappNumber: NUMBER })
    expect(await record('Bruninho')).toMatchObject({ name: 'Bruno Silva', whatsappProfileName: 'Bruninho' })
  })

  it('a lista de conversas lê o nome do cadastro ou, sem ele, o do perfil', async () => {
    await record('Zé 🍣')
    await service.recordProfileName({ establishmentId, whatsappNumber: '5516993056772', profileName: 'carla' })
    await db.insert(schema.customers).values({ establishmentId, name: '5511000000000', whatsappNumber: '5511000000000' })

    const names = await new DrizzleConversationContactNamesReader(db).namesFor(establishmentId, [
      NUMBER,
      '5516993056772',
      '5511000000000',
      '5599999999999',
    ])

    expect(Object.fromEntries(names)).toEqual({ [NUMBER]: 'Zé 🍣', '5516993056772': 'Carla' })
    const [stored] = await db.select().from(schema.customers).where(eq(schema.customers.whatsappNumber, NUMBER))
    expect(stored?.phone).toBe(NUMBER)
  })
})
