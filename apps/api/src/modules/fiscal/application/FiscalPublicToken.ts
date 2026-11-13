import { createHmac, timingSafeEqual } from 'node:crypto'

const SEPARATOR = '.'

function getSecret(): string {
  const secret = process.env.FISCAL_PUBLIC_TOKEN_SECRET
  if (!secret || secret.length === 0) {
    throw new Error('FISCAL_PUBLIC_TOKEN_SECRET is required for public fiscal links')
  }
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

// Signed, stateless link token so a customer can view/download their fiscal note without a login.
export function createFiscalPublicToken(fiscalDocumentId: string): string {
  const payload = Buffer.from(fiscalDocumentId, 'utf8').toString('base64url')
  return `${payload}${SEPARATOR}${sign(payload)}`
}

export function verifyFiscalPublicToken(token: string): string | undefined {
  const parts = token.split(SEPARATOR)
  if (parts.length !== 2) return undefined

  const [payload, signature] = parts as [string, string]
  const expected = sign(payload)

  const provided = Buffer.from(signature)
  const derived = Buffer.from(expected)
  if (provided.length !== derived.length || !timingSafeEqual(provided, derived)) return undefined

  return Buffer.from(payload, 'base64url').toString('utf8')
}
