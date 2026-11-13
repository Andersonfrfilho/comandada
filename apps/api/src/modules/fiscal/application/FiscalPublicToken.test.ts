import { afterAll, beforeAll, expect, test } from 'bun:test'

import { createFiscalPublicToken, verifyFiscalPublicToken } from './FiscalPublicToken'

const previousSecret = process.env.FISCAL_PUBLIC_TOKEN_SECRET

beforeAll(() => {
  process.env.FISCAL_PUBLIC_TOKEN_SECRET = 'public-link-secret-public-link'
})

afterAll(() => {
  if (previousSecret === undefined) {
    delete process.env.FISCAL_PUBLIC_TOKEN_SECRET
  } else {
    process.env.FISCAL_PUBLIC_TOKEN_SECRET = previousSecret
  }
})

test('round-trip: verify(create(id)) === id', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000'
  expect(verifyFiscalPublicToken(createFiscalPublicToken(id))).toBe(id)
})

test('tampered signature is rejected', () => {
  const token = createFiscalPublicToken('doc-123')
  const [payload] = token.split('.') as [string, string]
  expect(verifyFiscalPublicToken(`${payload}.deadbeef`)).toBeUndefined()
})

test('tampered payload is rejected (signature no longer matches)', () => {
  const token = createFiscalPublicToken('doc-123')
  const [, signature] = token.split('.') as [string, string]
  const otherPayload = Buffer.from('doc-999', 'utf8').toString('base64url')
  expect(verifyFiscalPublicToken(`${otherPayload}.${signature}`)).toBeUndefined()
})

test('malformed token is rejected', () => {
  expect(verifyFiscalPublicToken('not-a-token')).toBeUndefined()
})

test('token from a different secret does not verify', () => {
  const token = createFiscalPublicToken('doc-123')
  process.env.FISCAL_PUBLIC_TOKEN_SECRET = 'a-completely-different-secret-value'
  expect(verifyFiscalPublicToken(token)).toBeUndefined()
  process.env.FISCAL_PUBLIC_TOKEN_SECRET = 'public-link-secret-public-link'
})
