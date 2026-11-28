import type { AuthContext, AuthContextResolverPort } from '@adatechnology/module-http'

import { verifyAccessToken } from '@/infra/http/middlewares/authenticate'
import type { AuthenticatedUser } from '@/shared/types'
import { PERMISSION_SCOPE_RULES } from './moduleScopes.constant'

const BEARER_PREFIX = 'Bearer '

type VerifyAccessToken = (token: string) => Promise<AuthenticatedUser>

export function mapPermissionsToScopes(permissions: AuthenticatedUser['permissions']): string[] {
  const scopes = new Set<string>()
  for (const rule of PERMISSION_SCOPE_RULES) {
    const isGranted = permissions.some(
      (permission) => permission.resource === rule.resource && permission.action === rule.action
    )
    if (isGranted) rule.scopes.forEach((scope) => scopes.add(scope))
  }
  return [...scopes]
}

export function buildAuthContext(user: AuthenticatedUser): AuthContext {
  return {
    companyId: user.establishmentId,
    userId: user.id,
    scopes: mapPermissionsToScopes(user.permissions),
  }
}

export function createModuleAuthResolver(verifyToken: VerifyAccessToken = verifyAccessToken): AuthContextResolverPort {
  return {
    async resolve({ headers }) {
      const authorization = headers['authorization']
      if (!authorization?.startsWith(BEARER_PREFIX)) return undefined
      try {
        return buildAuthContext(await verifyToken(authorization.slice(BEARER_PREFIX.length)))
      } catch {
        return undefined
      }
    },
  }
}
