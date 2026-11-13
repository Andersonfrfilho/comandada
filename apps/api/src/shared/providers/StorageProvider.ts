export interface StorageProvider {
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>
  delete(key: string): Promise<void>
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>
}
