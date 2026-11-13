import { afterAll, beforeAll, expect, test } from 'bun:test'

import { decrypt, encrypt } from './SecretCipher'

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

test('round-trip: decrypt(encrypt(x)) === x', () => {
  const plaintext = 'certificado-base64-and-password:MEUS3GR3D0'
  expect(decrypt(encrypt(plaintext))).toBe(plaintext)
})

test('distinct IV per call produces distinct ciphertext', () => {
  const plaintext = 'same-input'
  expect(encrypt(plaintext)).not.toBe(encrypt(plaintext))
})

test('tampered ciphertext fails GCM auth verification', () => {
  const payload = encrypt('sensitive')
  const [iv, tag, ciphertext] = payload.split('.') as [string, string, string]
  const flipped = ciphertext[0] === 'A' ? 'B' : 'A'
  const tampered = `${iv}.${tag}.${flipped}${ciphertext.slice(1)}`
  expect(() => decrypt(tampered)).toThrow()
})

test('malformed payload (wrong part count) throws', () => {
  expect(() => decrypt('only.two')).toThrow('Invalid payload format')
})

test('truncated auth tag is rejected', () => {
  const [iv, , ciphertext] = encrypt('sensitive').split('.') as [string, string, string]
  const shortTag = Buffer.from([1, 2, 3, 4]).toString('base64')
  expect(() => decrypt(`${iv}.${shortTag}.${ciphertext}`)).toThrow('auth tag length')
})

test('missing APP_SECRET throws a clear error', () => {
  const saved = process.env.APP_SECRET
  delete process.env.APP_SECRET
  try {
    expect(() => encrypt('x')).toThrow('APP_SECRET is required for SecretCipher')
  } finally {
    process.env.APP_SECRET = saved
  }
})
