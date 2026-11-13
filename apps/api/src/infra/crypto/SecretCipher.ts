import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH_BYTES = 12
const AUTH_TAG_LENGTH_BYTES = 16
const KEY_LENGTH_BYTES = 32
const SALT = 'fiscal-cert'
const SEPARATOR = '.'

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, KEY_LENGTH_BYTES)
}

function getSecret(): string {
  const secret = process.env.APP_SECRET
  if (!secret || secret.length === 0) {
    throw new Error('APP_SECRET is required for SecretCipher')
  }
  return secret
}

export function encrypt(plaintext: string): string {
  const secret = getSecret()
  const key = deriveKey(secret)
  const iv = randomBytes(IV_LENGTH_BYTES)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  const ivBase64 = iv.toString('base64')
  const authTagBase64 = authTag.toString('base64')
  const ciphertextBase64 = encrypted.toString('base64')

  return `${ivBase64}${SEPARATOR}${authTagBase64}${SEPARATOR}${ciphertextBase64}`
}

export function decrypt(payload: string): string {
  const secret = getSecret()
  const key = deriveKey(secret)

  const parts = payload.split(SEPARATOR)
  if (parts.length !== 3) {
    throw new Error('Invalid payload format: expected iv.authTag.ciphertext')
  }

  const [ivBase64, authTagBase64, ciphertextBase64] = parts as [string, string, string]

  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')
  const ciphertext = Buffer.from(ciphertextBase64, 'base64')

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error('Invalid payload: unexpected IV length')
  }
  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Invalid payload: unexpected auth tag length')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
