import argon2 from 'argon2'
import { db } from '../connection'
import * as schema from '../schema'
import { ROLE_IDS } from './roles-permissions.seed'

const USER_IDS = {
  admin: '00000000-0000-0000-0002-000000000001',
  gerente: '00000000-0000-0000-0002-000000000002',
  caixa: '00000000-0000-0000-0002-000000000003',
  cozinha: '00000000-0000-0000-0002-000000000004',
  entregador: '00000000-0000-0000-0002-000000000005',
  atendente: '00000000-0000-0000-0002-000000000006',
} as const

export async function seedUsers(establishmentId: string): Promise<typeof USER_IDS> {
  const defaultPasswordHash = await argon2.hash('Demo@123')

  const users = [
    { id: USER_IDS.admin, roleId: ROLE_IDS.admin, name: 'Admin', email: 'admin@orderhub.io', passwordHash: await argon2.hash('Admin@123'), passwordMustChange: true },
    { id: USER_IDS.gerente, roleId: ROLE_IDS.gerente, name: 'Gerente Demo', email: 'gerente@orderhub.io', passwordHash: defaultPasswordHash, passwordMustChange: false },
    { id: USER_IDS.caixa, roleId: ROLE_IDS.caixa, name: 'Caixa Demo', email: 'caixa@orderhub.io', passwordHash: defaultPasswordHash, passwordMustChange: false },
    { id: USER_IDS.cozinha, roleId: ROLE_IDS.cozinha, name: 'Cozinha Demo', email: 'cozinha@orderhub.io', passwordHash: defaultPasswordHash, passwordMustChange: false },
    { id: USER_IDS.entregador, roleId: ROLE_IDS.entregador, name: 'Entregador Demo', email: 'entregador@orderhub.io', passwordHash: defaultPasswordHash, passwordMustChange: false },
    { id: USER_IDS.atendente, roleId: ROLE_IDS.atendente, name: 'Atendente Demo', email: 'atendente@orderhub.io', passwordHash: defaultPasswordHash, passwordMustChange: false },
  ].map((user) => ({ ...user, establishmentId, active: true }))

  await db.insert(schema.users).values(users).onConflictDoNothing()

  return USER_IDS
}
