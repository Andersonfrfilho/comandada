export const MODULE_BASE_PATH = {
  RECIPES: '/sdk/recipes',
  STOCK: '/sdk/stock',
  COUPONS: '/sdk/coupons',
} as const

export const RECIPES_DELETE_SCOPE = 'recipes:delete'
export const STOCK_DELETE_SCOPE = 'stock:delete'
export const COUPON_ADMIN_SCOPE = 'coupons:admin'
export const COUPON_SERVICE_SCOPE = 'coupons:service'

type PermissionScopeRule = {
  readonly resource: string
  readonly action: string
  readonly scopes: readonly string[]
}

// Os módulos do SDK não conhecem papéis do Comandada: cada permissão do token vira os escopos que eles pedem.
export const PERMISSION_SCOPE_RULES: readonly PermissionScopeRule[] = [
  { resource: 'products', action: 'read', scopes: ['recipes:read', 'stock:read'] },
  { resource: 'products', action: 'write', scopes: ['recipes:write', 'stock:write'] },
  // Apagar exige products:delete, como nas rotas antigas: escrever na ficha ou no estoque não basta.
  { resource: 'products', action: 'delete', scopes: [RECIPES_DELETE_SCOPE, STOCK_DELETE_SCOPE] },
  // Quem gerencia as configurações do restaurante gerencia as campanhas (admin e gerente hoje).
  { resource: 'settings', action: 'write', scopes: [COUPON_ADMIN_SCOPE] },
  // Quem lança pedido (atendente, garçom) ou fecha o caixa valida cupom no fechamento, sem gerir campanhas.
  { resource: 'orders', action: 'write', scopes: [COUPON_SERVICE_SCOPE] },
  { resource: 'cashier', action: 'write', scopes: [COUPON_SERVICE_SCOPE] },
]
