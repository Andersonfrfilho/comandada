import type { Middleware } from '../router'
import { NotFoundError, UnauthorizedError } from '@/shared/errors/AppError'

// Ensures the :establishmentId route param matches the authenticated user's tenant.
// Returns 404 (not 403) to avoid leaking resource existence across tenants.
export const tenantIsolation: Middleware = async (request, _response, next) => {
  if (!request.user) {
    throw new UnauthorizedError()
  }

  const routeEstablishmentId = request.params['establishmentId']

  if (routeEstablishmentId && routeEstablishmentId !== request.user.establishmentId) {
    throw new NotFoundError('Resource')
  }

  request.establishmentId = request.user.establishmentId

  await next()
}
