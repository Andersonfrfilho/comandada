import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { dirname } from 'path'
import type { StorageProvider } from './StorageProvider'
import { isValidStorageKey, resolveUploadPath, UPLOAD_DIR } from './storageKey'
const BASE_URL = 'http://localhost:3333'

export class LocalStorageProvider implements StorageProvider {
  constructor() {
    mkdirSync(UPLOAD_DIR, { recursive: true })
  }

  async upload(key: string, buffer: Buffer, _contentType: string): Promise<string> {
    const filePath = this.resolvePath(key)
    const dir = dirname(filePath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, buffer)
    return `${BASE_URL}/uploads/${key}`
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }

  async getSignedUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    return `${BASE_URL}/uploads/${key}`
  }

  getFilePath(key: string): string | undefined {
    if (!isValidStorageKey(key)) return undefined
    return this.resolvePath(key)
  }

  private resolvePath(key: string): string {
    return resolveUploadPath(key)
  }
}
