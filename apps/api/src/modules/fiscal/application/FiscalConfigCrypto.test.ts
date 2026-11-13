import { afterAll, beforeAll, expect, test } from 'bun:test'

import { decryptSensitiveConfig, encryptSensitiveConfig } from './FiscalConfigCrypto'

const previousSecret = process.env.APP_SECRET

beforeAll(() => {
  process.env.APP_SECRET = 'test-secret-secret-secret-secret'
})

afterAll(() => {
  if (previousSecret === undefined) {
    delete process.env.APP_SECRET
  } else {
    process.env.APP_SECRET = previousSecret
  }
})

test('encrypts sensitive keys with enc:v1: prefix and leaves others untouched', () => {
  const encrypted = encryptSensitiveConfig({
    certificadoBase64: 'PFX_BYTES',
    certificadoSenha: 'senha123',
    serie: '001',
  })
  expect(String(encrypted['certificadoBase64']).startsWith('enc:v1:')).toBe(true)
  expect(String(encrypted['certificadoSenha']).startsWith('enc:v1:')).toBe(true)
  expect(encrypted['serie']).toBe('001')
})

test('round-trip: decrypt(encrypt(x)) restores original sensitive values', () => {
  const original = { certificadoBase64: 'PFX_BYTES', cscToken: 'uuid-token', serie: '001' }
  const restored = decryptSensitiveConfig(encryptSensitiveConfig(original))
  expect(restored).toEqual(original)
})

test('does not double-encrypt already-encrypted values (idempotent upsert)', () => {
  const once = encryptSensitiveConfig({ certificadoSenha: 'senha' })
  const twice = encryptSensitiveConfig(once)
  expect(twice['certificadoSenha']).toBe(once['certificadoSenha'])
})

test('skips masked ***last4 values (never encrypts a mask)', () => {
  const encrypted = encryptSensitiveConfig({ certificadoSenha: '***3210' })
  expect(encrypted['certificadoSenha']).toBe('***3210')
})

test('legacy plaintext (no prefix) passes through decrypt unchanged', () => {
  const decrypted = decryptSensitiveConfig({ certificadoSenha: 'legacy-plaintext', serie: '001' })
  expect(decrypted['certificadoSenha']).toBe('legacy-plaintext')
  expect(decrypted['serie']).toBe('001')
})

test('empty/absent sensitive values are left as-is', () => {
  const encrypted = encryptSensitiveConfig({ certificadoBase64: '', serie: '001' })
  expect(encrypted['certificadoBase64']).toBe('')
})
