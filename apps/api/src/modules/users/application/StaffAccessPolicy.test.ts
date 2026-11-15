import { describe, expect, it } from 'bun:test'
import { StaffAccessPolicy, isRoleWithinActor } from './StaffAccessPolicy'
import type { StaffRepository, Permission } from '../domain/repositories/StaffRepository'

const ESTABLISHMENT_ID = 'establishment-1'

function permission(roleId: string, resource: string, action: string): Permission {
  return { id: `${roleId}-${resource}-${action}`, roleId, resource, action }
}

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [permission('admin', 'users', 'manage'), permission('admin', 'users', 'write'), permission('admin', 'orders', 'write')],
  attendant: [permission('attendant', 'orders', 'write')],
}

const repository = {
  async getRoleWithPermissions(roleId: string) {
    const permissions = ROLE_PERMISSIONS[roleId]
    if (!permissions) return null
    return { role: { id: roleId, establishmentId: ESTABLISHMENT_ID, name: roleId, description: null }, permissions }
  },
} as unknown as StaffRepository

const MANAGER = [
  { resource: 'users', action: 'write' },
  { resource: 'orders', action: 'write' },
]

describe('StaffAccessPolicy', () => {
  it('cargo cabe quando cada permissão dele é de quem concede', () => {
    expect(isRoleWithinActor(ROLE_PERMISSIONS.attendant!, MANAGER)).toBe(true)
    expect(isRoleWithinActor(ROLE_PERMISSIONS.admin!, MANAGER)).toBe(false)
  })

  it('gerente não cria Administrador', async () => {
    const policy = new StaffAccessPolicy(repository)
    await expect(policy.assertCanGrantRole('admin', ESTABLISHMENT_ID, MANAGER)).rejects.toThrow('mais acesso que o seu')
    await expect(policy.assertCanGrantRole('attendant', ESTABLISHMENT_ID, MANAGER)).resolves.toBeUndefined()
  })

  it('gerente não mexe em quem tem mais acesso', async () => {
    const policy = new StaffAccessPolicy(repository)
    await expect(policy.assertCanManageMember('admin', ESTABLISHMENT_ID, MANAGER)).rejects.toThrow('peça a um administrador')
  })

  it('cargo inexistente dá 404', async () => {
    const policy = new StaffAccessPolicy(repository)
    await expect(policy.assertCanGrantRole('ghost', ESTABLISHMENT_ID, MANAGER)).rejects.toMatchObject({ statusCode: 404 })
  })
})
