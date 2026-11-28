import { createCouponRoutes } from '@adatechnology/coupon-module'
import { createModuleFetchRouter } from '@adatechnology/module-http/fetch'
import type { ModuleRouteTable } from '@adatechnology/module-http'
import { createRecipeRoutes } from '@adatechnology/recipe-module'
import { createStockRoutes } from '@adatechnology/stock-module'

import { couponModule } from '@/infra/coupons/couponModule'
import { buildCorsAndSecurityHeaders, type Router } from '@/infra/http/router'
import { recipeModule, stockModule } from '@/infra/recipes/recipeStockModules'
import { clientIp } from '@/modules/storefront/infra/http/StorefrontController'
import { createModuleAuthResolver } from './moduleAuthResolver'
import { MODULE_BASE_PATH } from './moduleScopes.constant'

type MountModuleParams = {
  readonly router: Router
  readonly routes: ModuleRouteTable
  readonly basePath: string
}

// O `Router` do Comandada não tem curinga: cada rota da tabela do módulo vira uma rota própria.
function mountModule({ router, routes, basePath }: MountModuleParams): void {
  const moduleRouter = createModuleFetchRouter({ routes, basePath, authResolver: createModuleAuthResolver() })

  async function handle(request: Request): Promise<Response> {
    const response = await moduleRouter.handle(request, { ip: clientIp(Object.fromEntries(request.headers)) })
    const headers = new Headers(response.headers)
    buildCorsAndSecurityHeaders(request.headers.get('origin') ?? '').forEach((value, name) => headers.set(name, value))
    return new Response(response.body, { status: response.status, headers })
  }

  for (const route of routes) router.raw(route.method, `${basePath}${route.path}`, handle)
}

// Resgatar e liberar uso de cupom é decisão do backend (com o total que ele calculou): nunca por token de usuário.
const BACKEND_ONLY_COUPON_PATHS: ReadonlySet<string> = new Set(['/redemptions', '/redemptions/release'])

export function selectHttpCouponRoutes(routes: ModuleRouteTable): ModuleRouteTable {
  return routes.filter((route) => !BACKEND_ONLY_COUPON_PATHS.has(route.path))
}

export function registerSdkModuleRoutes(router: Router): void {
  mountModule({ router, routes: createRecipeRoutes({ module: recipeModule }), basePath: MODULE_BASE_PATH.RECIPES })
  mountModule({ router, routes: createStockRoutes({ module: stockModule }), basePath: MODULE_BASE_PATH.STOCK })
  mountModule({ router, routes: selectHttpCouponRoutes(createCouponRoutes({ module: couponModule })), basePath: MODULE_BASE_PATH.COUPONS })
}
