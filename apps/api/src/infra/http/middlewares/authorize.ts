import type { Middleware } from '../router'
import { ForbiddenError, UnauthorizedError } from '@/shared/errors/AppError'
import type { Resource, Action } from '@/shared/types'

export function authorize(resource: Resource, action: Action): Middleware {
  return async (request, _response, next) => {
    if (!request.user) {
      throw new UnauthorizedError()
    }

    const hasPermission = request.user.permissions.some(
      (permission) => permission.resource === resource && permission.action === action
    )

    if (!hasPermission) {
      throw new ForbiddenError()
    }

    await next()
  }
}
