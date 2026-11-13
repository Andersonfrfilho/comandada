export interface CacheProvider {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  /** `SET NX EX` atômico: true quando esta chamada criou a chave. Base de nonce/idempotência. */
  setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  increment(key: string): Promise<number>
  expire(key: string, ttlSeconds: number): Promise<void>
  ttl(key: string): Promise<number>
  publish(channel: string, message: string): Promise<void>
  subscribe(channel: string, callback: (message: string) => void): Promise<void>
}
