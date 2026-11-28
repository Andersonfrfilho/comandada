import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { createCouponModule, runCouponMigrations, type CouponModule } from '@adatechnology/coupon-module'
import { COUPON_ERROR_CODES, createCampaignSchema, type CartItem, type CreateCampaignInput } from '@adatechnology/coupon-contracts'
import { Pool } from 'pg'

// Comportamento do módulo de cupons que o pedido vai usar (cotação, limite, liberação, isolamento por empresa).
// Sem TEST_DATABASE_URL o teste é pulado. Ex.: TEST_DATABASE_URL=postgres://… bun test couponModule
const DATABASE_URL = process.env['TEST_DATABASE_URL']

const COMPANY_ID = '00000000-0000-4000-8000-00000000000a'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-00000000000b'
const CONCURRENT_ORDERS = 10
const USAGE_LIMIT = 3
const CART: readonly CartItem[] = [{ productId: 'produto-1', priceCents: 5000, quantity: 2 }]

function orderRef(id: string) {
  return { kind: 'order', id }
}

describe.skipIf(!DATABASE_URL)('Módulo de cupons (Postgres)', () => {
  let pool: Pool
  let db: NodePgDatabase
  let coupons: CouponModule

  async function createCampaign(overrides: Partial<CreateCampaignInput>, companyId = COMPANY_ID): Promise<void> {
    await coupons.useCases.createCampaign.execute({
      companyId,
      input: createCampaignSchema.parse({
        name: 'Campanha',
        codeMode: 'fixed',
        isActive: true,
        fixedCode: 'PROMO',
        discount: { kind: 'percent', value: 10 },
        ...overrides,
      }),
    })
  }

  function redeem(id: string, code = 'PROMO', companyId = COMPANY_ID) {
    return coupons.useCases.redeemCoupon.execute({ companyId, code, orderRef: orderRef(id), items: CART })
  }

  async function countRedemptions(condition = sql`TRUE`): Promise<number> {
    const result = await db.execute(sql`SELECT count(*)::int AS total FROM coupons.redemptions WHERE ${condition}`)
    return (result.rows[0] as { total: number }).total
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL, max: 20 })
    db = drizzle(pool)
    await runCouponMigrations({ db, migrate })
    coupons = createCouponModule({ db, config: { adminScopes: ['coupons:admin'] }, providers: { clock: { now: () => new Date() } } })
  })

  afterAll(async () => {
    await pool?.end()
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE coupons.redemptions, coupons.coupons, coupons.leads, coupons.campaigns CASCADE`)
  })

  it('cotação percentual desconta sobre o subtotal e não grava nada', async () => {
    await createCampaign({ discount: { kind: 'percent', value: 10 } })

    const quote = await coupons.useCases.quoteCoupon.execute({ companyId: COMPANY_ID, code: 'PROMO', items: CART })

    expect(quote).toMatchObject({ valid: true, subtotalCents: 10000, discountCents: 1000, totalCents: 9000 })
    expect(await countRedemptions()).toBe(0)
  })

  it('cotação de valor fixo desconta o valor em centavos', async () => {
    await createCampaign({ discount: { kind: 'fixed', value: 1500 } })

    const quote = await coupons.useCases.quoteCoupon.execute({ companyId: COMPANY_ID, code: 'PROMO', items: CART })

    expect(quote).toMatchObject({ valid: true, discountCents: 1500, totalCents: 8500 })
  })

  it('10 pedidos simultâneos num limite de 3 resgatam exatamente 3', async () => {
    await createCampaign({ usageLimitTotal: USAGE_LIMIT })

    const results = await Promise.allSettled(Array.from({ length: CONCURRENT_ORDERS }, (_, index) => redeem(`pedido-${index}`)))

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(USAGE_LIMIT)
    expect(await countRedemptions(sql`status = 'redeemed'`)).toBe(USAGE_LIMIT)
  })

  it('liberar devolve o uso e outro pedido passa a caber', async () => {
    await createCampaign({ usageLimitTotal: 1 })
    await redeem('pedido-1')
    await expect(redeem('pedido-2')).rejects.toBeDefined()

    await coupons.useCases.releaseRedemption.execute({ companyId: COMPANY_ID, orderRef: orderRef('pedido-1') })

    expect((await redeem('pedido-2')).isNew).toBe(true)
  })

  it('liberar duas vezes não quebra e não devolve dois usos', async () => {
    await createCampaign({ usageLimitTotal: 1 })
    await redeem('pedido-1')

    await coupons.useCases.releaseRedemption.execute({ companyId: COMPANY_ID, orderRef: orderRef('pedido-1') })
    await coupons.useCases.releaseRedemption.execute({ companyId: COMPANY_ID, orderRef: orderRef('pedido-1') })

    await redeem('pedido-2')
    await expect(redeem('pedido-3')).rejects.toBeDefined()
  })

  it('resgatar de novo o mesmo pedido reaproveita a linha, também depois de liberada', async () => {
    await createCampaign({ usageLimitTotal: 1 })
    const first = await redeem('pedido-1')
    const repeated = await redeem('pedido-1')
    expect(repeated.isNew).toBe(false)
    expect(repeated.redemption.id).toBe(first.redemption.id)

    await coupons.useCases.releaseRedemption.execute({ companyId: COMPANY_ID, orderRef: orderRef('pedido-1') })
    const reopened = await redeem('pedido-1')

    expect(reopened.redemption.id).toBe(first.redemption.id)
    expect(reopened.redemption.status).toBe('redeemed')
    expect(await countRedemptions()).toBe(1)
  })

  it('cupom de outro estabelecimento é recusado igual a um código que não existe, sem revelar a campanha', async () => {
    await createCampaign({ fixedCode: 'OUTRA' }, OTHER_COMPANY_ID)

    const foreign = await redeem('pedido-1', 'OUTRA').catch((caught: unknown) => caught)
    const missing = await redeem('pedido-2', 'NAOEXISTE').catch((caught: unknown) => caught)
    const quote = await coupons.useCases.quoteCoupon.execute({ companyId: COMPANY_ID, code: 'OUTRA', items: CART }).catch((caught: unknown) => caught)

    expect(foreign).toMatchObject({ statusCode: 422, code: COUPON_ERROR_CODES.NOT_APPLICABLE })
    expect(foreign).toMatchObject({ details: (missing as { details: unknown }).details })
    expect(quote).toMatchObject({ valid: false, discountCents: 0 })
    expect(await countRedemptions()).toBe(0)
  })
})
