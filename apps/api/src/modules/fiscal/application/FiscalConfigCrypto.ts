import { encrypt, decrypt } from '@/infra/crypto/SecretCipher'

const SENSITIVE_KEYS = ['certificadoBase64', 'certificadoSenha', 'cscToken', 'activationCode', 'signatureAC'] as const

const ENCRYPTION_PREFIX = 'enc:v1:'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function encryptSensitiveConfig(providerConfig: Record<string, unknown>): Record<string, unknown> {
  const result = { ...providerConfig }

  for (const key of SENSITIVE_KEYS) {
    const value = result[key]
    if (!isNonEmptyString(value)) continue
    if (value.startsWith(ENCRYPTION_PREFIX)) continue
    if (value.startsWith('***')) continue
    result[key] = ENCRYPTION_PREFIX + encrypt(value)
  }

  return result
}

export function decryptSensitiveConfig(providerConfig: Record<string, unknown>): Record<string, unknown> {
  const result = { ...providerConfig }

  for (const key of SENSITIVE_KEYS) {
    const value = result[key]
    if (!isNonEmptyString(value)) continue
    if (!value.startsWith(ENCRYPTION_PREFIX)) continue
    result[key] = decrypt(value.slice(ENCRYPTION_PREFIX.length))
  }

  return result
}
