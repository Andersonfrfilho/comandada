import { describe, expect, it } from 'bun:test'

import type { AuthenticatedUser } from '@/shared/types'
import { createModuleAuthResolver, mapPermissionsToScopes } from './moduleAuthResolver'
import { COUPON_ADMIN_SCOPE } from './moduleScopes.constant'

const ESTABLISHMENT_ID = '00000000-0000-0000-0000-00000000000a'

function buildUser(permissions: AuthenticatedUser['permissions']): AuthenticatedUser {
  return { id: 'user-1', establishmentId: ESTABLISHMENT_ID, email: 'a@example.com', name: 'A', role: 'gerente', permissions }
}

describe('mapPermissionsToScopes', () => {
  it('products:read leva a leitura de ficha e estoque', () => {
    expect(mapPermissionsToScopes([{ resource: 'products', action: 'read' }])).toEqual(['recipes:read', 'stock:read'])
  })

  it('products:write leva a escrita de ficha e estoque, sem leitura', () => {
    expect(mapPermissionsToScopes([{ resource: 'products', action: 'write' }])).toEqual(['recipes:write', 'stock:write'])
  })

  it('settings:write leva a administração de cupons', () => {
    expect(mapPermissionsToScopes([{ resource: 'settings', action: 'write' }])).toEqual([COUPON_ADMIN_SCOPE])
  })

  it('permissão sem regra não vira escopo', () => {
    expect(mapPermissionsToScopes([{ resource: 'kitchen', action: 'write' }, { resource: 'settings', action: 'read' }])).toEqual([])
  })
})

describe('createModuleAuthResolver', () => {
  const resolver = createModuleAuthResolver(async (token) => {
    if (token !== 'valid') throw new Error('invalid_token')
    return buildUser([{ resource: 'products', action: 'read' }])
  })

  it('a empresa e a pessoa vêm do token', async () => {
    const context = await resolver.resolve({ headers: { authorization: 'Bearer valid' } })
    expect(context).toEqual({ companyId: ESTABLISHMENT_ID, userId: 'user-1', scopes: ['recipes:read', 'stock:read'] })
  })

  it('sem cabeçalho ou com token inválido não há identidade', async () => {
    expect(await resolver.resolve({ headers: {} })).toBeUndefined()
    expect(await resolver.resolve({ headers: { authorization: 'Bearer nope' } })).toBeUndefined()
  })
})
