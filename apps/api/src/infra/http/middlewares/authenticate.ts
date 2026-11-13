import { jwtVerify, type JWTPayload } from 'jose'
import type { Middleware } from '../router'
import { UnauthorizedError } from '@/shared/errors/AppError'
import type { AuthenticatedUser } from '@/shared/types'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'change-me')

interface AuthPayload extends JWTPayload {
  sub: string
  establishmentId: string
  email: string
  name: string
  role: string
  permissions: Array<{ resource: string; action: string }>
}

function isAuthPayload(payload: JWTPayload): payload is AuthPayload {
  return (
    typeof payload.sub === 'string' &&
    typeof (payload as Record<string, unknown>)['establishmentId'] === 'string' &&
    typeof (payload as Record<string, unknown>)['email'] === 'string' &&
    typeof (payload as Record<string, unknown>)['role'] === 'string' &&
    Array.isArray((payload as Record<string, unknown>)['permissions'])
  )
}

export const authenticate: Middleware = async (request, response, next) => {
  const authHeader = request.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('missing_token')
  }

  const token = authHeader.slice(7)

  let payload: JWTPayload
  try {
    const result = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    })
    payload = result.payload
  } catch {
    throw new UnauthorizedError('invalid_token')
  }

  if (!isAuthPayload(payload)) {
    throw new UnauthorizedError('invalid_token')
  }

  const user: AuthenticatedUser = {
    id: payload.sub,
    establishmentId: payload.establishmentId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    permissions: payload.permissions,
  }

  request.user = user
  request.establishmentId = user.establishmentId

  await next()
}
