import { resolve, sep } from 'path'

export const UPLOAD_DIR = '/tmp/uploads'

const STORAGE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_thumb)?\.[A-Za-z0-9]{1,10}$/
const FILE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,10}$/
const FALLBACK_EXTENSION = '.bin'

export class InvalidStorageKeyError extends Error {
  constructor() {
    super('Invalid storage key')
    this.name = 'InvalidStorageKeyError'
  }
}

export function isValidStorageKey(key: string): boolean {
  return STORAGE_KEY_PATTERN.test(key)
}

export function resolveUploadPath(key: string): string {
  if (!isValidStorageKey(key)) throw new InvalidStorageKeyError()
  const filePath = resolve(UPLOAD_DIR, key)
  // Defense in depth: the key pattern already forbids separators.
  if (!filePath.startsWith(UPLOAD_DIR + sep)) throw new InvalidStorageKeyError()
  return filePath
}

export function normalizeFileExtension(extension: string): string {
  const lowerCaseExtension = extension.toLowerCase()
  if (!FILE_EXTENSION_PATTERN.test(lowerCaseExtension)) return FALLBACK_EXTENSION
  return lowerCaseExtension
}
