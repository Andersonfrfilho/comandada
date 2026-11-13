import { createHash, timingSafeEqual } from 'crypto'
import type { Middleware } from '@/infra/http/router'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import { SYNC_CHECKSUM_HEADER, SYNC_TOKEN_HEADER, checksumOf } from '../../application/SyncWorker'

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** Token compartilhado entre loja e nuvem, comparado em tempo constante. Falha fechado. */
export function syncAuth(expectedToken: string): Middleware {
  const expectedDigest = digest(expectedToken)
  return async (request, _response, next) => {
    const token = request.headers[SYNC_TOKEN_HEADER]
    if (!token || !timingSafeEqual(digest(token), expectedDigest)) {
      throw new UnauthorizedError('invalid_sync_token')
    }
    const checksum = request.headers[SYNC_CHECKSUM_HEADER]
    if (checksum !== undefined && checksum !== checksumOf(request.rawBody.toString('utf8'))) {
      throw new ValidationError('Lote corrompido no caminho (checksum não confere)')
    }
    await next()
  }
}
