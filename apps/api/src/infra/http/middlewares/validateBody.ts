import type { ZodSchema } from 'zod'
import type { Middleware } from '../router'
import { ValidationError } from '@/shared/errors/AppError'

export function validateBody<T>(schema: ZodSchema<T>): Middleware {
  return async (request, _response, next) => {
    const result = schema.safeParse(request.body)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }
    request.body = result.data
    await next()
  }
}
