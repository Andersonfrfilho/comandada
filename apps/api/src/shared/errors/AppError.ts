export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details: unknown

  constructor(message: string, code: string, statusCode: number, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'validation_error', 400, details)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'not_found', 404)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = 'unauthorized') {
    super('Authentication required', code, 401)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super('Access denied', 'forbidden', 403)
    this.name = 'ForbiddenError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'conflict', 409, details)
    this.name = 'ConflictError'
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'unprocessable', 422, details)
    this.name = 'UnprocessableError'
  }
}

export class RateLimitError extends AppError {
  readonly retryAfter: number

  constructor(retryAfter: number) {
    super('Too many requests', 'rate_limit_exceeded', 429)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

export class LockedError extends AppError {
  readonly retryAfter: number

  constructor(message: string, retryAfter: number) {
    super(message, 'account_locked', 423)
    this.name = 'LockedError'
    this.retryAfter = retryAfter
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`${service} is unavailable`, 'service_unavailable', 503)
    this.name = 'ServiceUnavailableError'
  }
}
