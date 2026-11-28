import { describe, expect, it } from 'bun:test'
import { createCouponRoutes } from '@adatechnology/coupon-module'
import { createModuleFetchRouter } from '@adatechnology/module-http/fetch'

import { couponModule } from '@/infra/coupons/couponModule'
import { createModuleAuthResolver } from './moduleAuthResolver'
import { COUPON_SERVICE_SCOPE, MODULE_BASE_PATH } from './moduleScopes.constant'
import { selectHttpCouponRoutes } from './registerSdkModuleRoutes'

const COMPANY_ID = '00000000-0000-4000-8000-00000000000a'

describe('rotas de cupom expostas por HTTP', () => {
  const routes = selectHttpCouponRoutes(createCouponRoutes({ module: couponModule }))

  it('não registra resgate nem liberação', () => {
    const paths = routes.map((route) => route.path)
    expect(paths).not.toContain('/redemptions')
    expect(paths).not.toContain('/redemptions/release')
  })

  it('mantém validar, cotar e automático para a equipe', () => {
    const paths = routes.map((route) => route.path)
    for (const path of ['/coupons/validate', '/coupons/quote', '/coupons/automatic']) expect(paths).toContain(path)
  })

  it('resgate com token de caixa responde 404 e a cotação passa da autenticação e do escopo', async () => {
    const authResolver = createModuleAuthResolver(async () => ({
      id: 'user-1',
      establishmentId: COMPANY_ID,
      email: 'caixa@example.com',
      name: 'Caixa',
      role: 'caixa',
      permissions: [{ resource: 'cashier', action: 'write' }],
    }))
    expect(COUPON_SERVICE_SCOPE).toBe('coupons:service')
    const router = createModuleFetchRouter({ routes, basePath: MODULE_BASE_PATH.COUPONS, authResolver })
    const call = (path: string) =>
      router.handle(
        new Request(`http://localhost${MODULE_BASE_PATH.COUPONS}${path}`, {
          method: 'POST',
          headers: { authorization: 'Bearer any', 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
        { ip: '127.0.0.1' }
      )

    expect((await call('/redemptions')).status).toBe(404)
    expect((await call('/redemptions/release')).status).toBe(404)
    const quote = await call('/coupons/quote')
    expect([401, 403, 404]).not.toContain(quote.status)
  })
})
