import { db } from '../connection'
import * as schema from '../schema'

export const ROLE_IDS = {
  admin: '00000000-0000-0000-0001-000000000001',
  gerente: '00000000-0000-0000-0001-000000000002',
  caixa: '00000000-0000-0000-0001-000000000003',
  cozinha: '00000000-0000-0000-0001-000000000004',
  entregador: '00000000-0000-0000-0001-000000000005',
  atendente: '00000000-0000-0000-0001-000000000006',
} as const

// `finance` estava fora desta lista embora as rotas usem `authorize('finance')`
// — nenhum papel recebia a permissão, nem o admin, e a tela Financeiro ficava
// inacessível para todo mundo.
const ALL_RESOURCES = ['orders', 'kitchen', 'cashier', 'delivery', 'users', 'products', 'reports', 'settings', 'conversations', 'finance'] as const
const ALL_ACTIONS = ['read', 'write', 'delete', 'manage'] as const

const ADMIN_PERMISSIONS = ALL_RESOURCES.flatMap((resource) =>
  ALL_ACTIONS.map((action) => ({ roleId: ROLE_IDS.admin, resource, action }))
)

const ROLE_PERMISSIONS = [
  ...['orders', 'kitchen', 'cashier', 'delivery', 'products', 'reports'].flatMap((resource) =>
    ['read', 'write', 'delete'].map((action) => ({ roleId: ROLE_IDS.gerente, resource, action }))
  ),
  { roleId: ROLE_IDS.caixa, resource: 'cashier', action: 'read' },
  { roleId: ROLE_IDS.caixa, resource: 'cashier', action: 'write' },
  { roleId: ROLE_IDS.caixa, resource: 'orders', action: 'read' },
  { roleId: ROLE_IDS.cozinha, resource: 'kitchen', action: 'read' },
  { roleId: ROLE_IDS.cozinha, resource: 'kitchen', action: 'write' },
  { roleId: ROLE_IDS.cozinha, resource: 'orders', action: 'read' },
  { roleId: ROLE_IDS.entregador, resource: 'delivery', action: 'read' },
  { roleId: ROLE_IDS.entregador, resource: 'delivery', action: 'write' },
  { roleId: ROLE_IDS.entregador, resource: 'orders', action: 'read' },
  { roleId: ROLE_IDS.atendente, resource: 'orders', action: 'read' },
  { roleId: ROLE_IDS.atendente, resource: 'orders', action: 'write' },
  { roleId: ROLE_IDS.atendente, resource: 'conversations', action: 'read' },
  { roleId: ROLE_IDS.atendente, resource: 'conversations', action: 'write' },
  { roleId: ROLE_IDS.gerente, resource: 'conversations', action: 'read' },
  { roleId: ROLE_IDS.gerente, resource: 'conversations', action: 'write' },
  { roleId: ROLE_IDS.gerente, resource: 'conversations', action: 'manage' },
  // Novas entradas vão no FIM: o id da permissão vem da posição no array (ver `permissionId`),
  // e inserir no meio deslocaria o id de todas as seguintes, duplicando-as no próximo seed.
  { roleId: ROLE_IDS.gerente, resource: 'settings', action: 'read' },
  { roleId: ROLE_IDS.gerente, resource: 'settings', action: 'write' },
  // O menu do frontend (`constants/navigation.ts`) libera Financeiro,
  // Funcionários e Cargos para o gerente, mas a API não concedia nenhum dos
  // dois recursos — o gerente via a tela vazia como se não houvesse cadastro.
  { roleId: ROLE_IDS.gerente, resource: 'finance', action: 'read' },
  { roleId: ROLE_IDS.gerente, resource: 'finance', action: 'write' },
  { roleId: ROLE_IDS.gerente, resource: 'users', action: 'read' },
  { roleId: ROLE_IDS.gerente, resource: 'users', action: 'write' },
]

// Permissions have no unique constraint besides `id`. Assign deterministic ids
// (derived from array position) so onConflictDoNothing() actually dedupes on re-run —
// with a random default id, every `make hub-seed` re-run would duplicate every row.
function permissionId(index: number): string {
  return `00000000-0000-0000-0090-${String(index).padStart(12, '0')}`
}

export async function seedRolesAndPermissions(establishmentId: string): Promise<void> {
  const roles = [
    { id: ROLE_IDS.admin, establishmentId, name: 'Administrador' },
    { id: ROLE_IDS.gerente, establishmentId, name: 'Gerente' },
    { id: ROLE_IDS.caixa, establishmentId, name: 'Caixa' },
    { id: ROLE_IDS.cozinha, establishmentId, name: 'Cozinha' },
    { id: ROLE_IDS.entregador, establishmentId, name: 'Entregador' },
    { id: ROLE_IDS.atendente, establishmentId, name: 'Atendente' },
  ]
  await db.insert(schema.roles).values(roles).onConflictDoNothing()

  const permissions = [...ADMIN_PERMISSIONS, ...ROLE_PERMISSIONS].map((permission, index) => ({
    id: permissionId(index),
    ...permission,
  }))
  await db.insert(schema.permissions).values(permissions).onConflictDoNothing()
}
