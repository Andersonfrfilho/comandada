import { describe, expect, it } from 'bun:test'
import { hasPermission, permissionsFromAccessToken } from './permissions'

function tokenWith(payload: unknown): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`
}

describe('permissions', () => {
  it('confere recurso e ação', () => {
    const permissions = [{ resource: 'orders', action: 'read' }]
    expect(hasPermission(permissions, { resource: 'orders', action: 'read' })).toBe(true)
    expect(hasPermission(permissions, { resource: 'orders', action: 'write' })).toBe(false)
    expect(hasPermission(undefined, { resource: 'orders', action: 'read' })).toBe(false)
  })

  it('lê as permissões do token, com acento no nome', () => {
    const token = tokenWith({ name: 'João', permissions: [{ resource: 'kitchen', action: 'read' }, { bad: true }] })
    expect(permissionsFromAccessToken(token)).toEqual([{ resource: 'kitchen', action: 'read' }])
  })

  it('token estragado não derruba', () => {
    expect(permissionsFromAccessToken('abc')).toBeNull()
    expect(permissionsFromAccessToken('a.%%%.c')).toBeNull()
  })
})
