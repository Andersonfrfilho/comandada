/**
 * Acesso no painel vem das mesmas permissões que a API confere (recurso + ação), nunca do nome do
 * cargo: com nome, um cargo novo ou renomeado via tela de Cargos ficava sem menu, e o gerente via
 * telas que a API recusava com 403.
 */
export type PermissionResource =
  | 'orders'
  | 'kitchen'
  | 'cashier'
  | 'delivery'
  | 'users'
  | 'products'
  | 'reports'
  | 'settings'
  | 'conversations'
  | 'fiscal'
  | 'finance'
  | 'customers'

export type PermissionAction = 'read' | 'write' | 'delete' | 'manage'

export interface Permission {
  resource: string
  action: string
}

export interface RequiredPermission {
  resource: PermissionResource
  action: PermissionAction
}

/** Uma permissão, ou uma lista em que qualquer uma basta (ex.: Mesas para quem lança pedido ou cuida do caixa). */
export type PermissionRule = RequiredPermission | readonly RequiredPermission[]

export function hasPermission(
  permissions: Permission[] | undefined,
  required: PermissionRule
): boolean {
  const options: readonly RequiredPermission[] = Array.isArray(required) ? required : [required as RequiredPermission]
  return options.some((option) =>
    (permissions ?? []).some(
      (permission) => permission.resource === option.resource && permission.action === option.action
    )
  )
}

function isPermission(value: unknown): value is Permission {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate['resource'] === 'string' && typeof candidate['action'] === 'string'
}

/** Lê as permissões do access token (renovado a cada 15 min), para o menu seguir mudanças de cargo. */
export function permissionsFromAccessToken(accessToken: string): Permission[] | null {
  const payloadPart = accessToken.split('.')[1]
  if (!payloadPart) return null
  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof payload !== 'object' || payload === null) return null
    const permissions = (payload as Record<string, unknown>)['permissions']
    if (!Array.isArray(permissions)) return null
    return permissions.filter(isPermission).map(({ resource, action }) => ({ resource, action }))
  } catch {
    return null
  }
}
