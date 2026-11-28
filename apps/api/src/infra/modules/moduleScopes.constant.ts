export const MODULE_BASE_PATH = {
  RECIPES: '/sdk/recipes',
  STOCK: '/sdk/stock',
  COUPONS: '/sdk/coupons',
} as const

export const COUPON_ADMIN_SCOPE = 'coupons:admin'

type PermissionScopeRule = {
  readonly resource: string
  readonly action: string
  readonly scopes: readonly string[]
}

// Os módulos do SDK não conhecem papéis do Comandada: cada permissão do token vira os escopos que eles pedem.
export const PERMISSION_SCOPE_RULES: readonly PermissionScopeRule[] = [
  { resource: 'products', action: 'read', scopes: ['recipes:read', 'stock:read'] },
  { resource: 'products', action: 'write', scopes: ['recipes:write', 'stock:write'] },
  // Quem gerencia as configurações do restaurante gerencia as campanhas (admin e gerente hoje).
  { resource: 'settings', action: 'write', scopes: [COUPON_ADMIN_SCOPE] },
]
