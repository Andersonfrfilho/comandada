import { createHash } from 'crypto'
import type { SyncEnvironment } from '../shared/syncEnvironment'
import type { SyncChange, SyncCursor, SyncRepository } from '../infra/SyncRepository'

export const SYNC_TOKEN_HEADER = 'x-sync-token'
export const SYNC_CHECKSUM_HEADER = 'x-sync-checksum'
export const CLOUD_PEER_ID = 'nuvem'

/** Lote também é cortado por tamanho, para não estourar um sinal fraco com uma requisição gigante. */
const MAX_BATCH_BYTES = 256 * 1024
const MINIMUM_BATCH_SIZE = 10
const BASE_BACKOFF_MS = 2_000

export function checksumOf(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}

/** Corta o lote no tamanho máximo, sempre mantendo ao menos uma mudança para não travar a fila. */
export function trimToByteLimit(changes: readonly SyncChange[], maxBytes: number = MAX_BATCH_BYTES): SyncChange[] {
  const trimmed: SyncChange[] = []
  let total = 0
  for (const change of changes) {
    const size = Buffer.byteLength(JSON.stringify(change))
    if (trimmed.length > 0 && total + size > maxBytes) break
    trimmed.push(change)
    total += size
  }
  return trimmed
}

/** Espera entre tentativas: dobra a cada falha seguida, com um pouco de aleatoriedade, até o teto. */
export function backoffDelay(consecutiveFailures: number, maxBackoffMs: number, random: () => number = Math.random): number {
  if (consecutiveFailures <= 0) return 0
  const exponential = BASE_BACKOFF_MS * 2 ** Math.min(consecutiveFailures - 1, 10)
  const capped = Math.min(exponential, maxBackoffMs)
  return Math.round(capped * (0.75 + random() * 0.5))
}

export interface SyncCycleResult {
  readonly pushed: number
  readonly pulled: number
  /** true quando algum lado ainda tinha mais do que um lote: o próximo ciclo começa sem esperar. */
  readonly hasMore: boolean
}

type FetchFunction = (input: string, init: RequestInit) => Promise<Response>

interface SyncWorkerDependencies {
  readonly repository: SyncRepository
  readonly environment: SyncEnvironment
  readonly nodeId: string
  readonly fetchFunction?: FetchFunction
}

/**
 * Roda na loja. A cada ciclo envia as mudanças locais para a nuvem e depois puxa as da nuvem.
 *
 * Feito para sinal ruim: lotes pequenos, tempo limite por requisição, lote cai pela metade quando
 * uma requisição falha e volta a crescer quando dá certo, e espera crescente entre falhas. O cursor
 * só anda depois da confirmação, e a nuvem ignora o que já aplicou, então reenviar é seguro.
 */
export class SyncWorker {
  private readonly repository: SyncRepository
  private readonly environment: SyncEnvironment
  private readonly nodeId: string
  private readonly fetchFunction: FetchFunction
  private readonly peerUrl: string
  private batchSize: number
  private consecutiveFailures = 0
  private running = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private currentCycle: Promise<void> | undefined

  constructor(dependencies: SyncWorkerDependencies) {
    this.repository = dependencies.repository
    this.environment = dependencies.environment
    this.nodeId = dependencies.nodeId
    this.fetchFunction = dependencies.fetchFunction ?? ((input, init) => fetch(input, init))
    this.peerUrl = (dependencies.environment.SYNC_PEER_URL ?? '').replace(/\/+$/, '')
    this.batchSize = dependencies.environment.SYNC_BATCH_SIZE
  }

  get currentBatchSize(): number {
    return this.batchSize
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.schedule(0)
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    await this.currentCycle
  }

  private schedule(delayMs: number): void {
    if (!this.running) return
    this.timer = setTimeout(() => {
      this.currentCycle = this.tick()
    }, delayMs)
  }

  private async tick(): Promise<void> {
    let nextDelay = this.environment.SYNC_INTERVAL_MS
    try {
      const result = await this.runCycle()
      this.consecutiveFailures = 0
      this.batchSize = Math.min(this.environment.SYNC_BATCH_SIZE, this.batchSize * 2)
      await this.repository.recordAttempt(CLOUD_PEER_ID, null)
      if (result.hasMore) nextDelay = 0
    } catch (error) {
      this.consecutiveFailures += 1
      this.batchSize = Math.max(MINIMUM_BATCH_SIZE, Math.floor(this.batchSize / 2))
      nextDelay = Math.max(nextDelay, backoffDelay(this.consecutiveFailures, this.environment.SYNC_MAX_BACKOFF_MS))
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[Sync] falhou (${this.consecutiveFailures}x seguidas), tenta de novo em ${nextDelay}ms: ${message}`)
      await this.repository.recordAttempt(CLOUD_PEER_ID, message).catch(() => undefined)
    }
    this.schedule(nextDelay)
  }

  async runCycle(): Promise<SyncCycleResult> {
    const peer = await this.repository.getPeer(CLOUD_PEER_ID)
    const pushed = await this.push(peer.lastPushed)
    const pulled = await this.pull(peer.lastPulled)
    return { pushed: pushed.count, pulled: pulled.count, hasMore: pushed.full || pulled.full }
  }

  private async push(after: SyncCursor): Promise<{ count: number; full: boolean }> {
    const read = await this.repository.readChanges({ after, limit: this.batchSize, onlyOrigin: this.nodeId })
    const changes = trimToByteLimit(read)
    if (changes.length === 0) return { count: 0, full: false }

    const body = JSON.stringify({ nodeId: this.nodeId, changes })
    const response = await this.request('/internal/sync/push', { method: 'POST', body })
    const payload = (await response.json()) as { cursor?: SyncCursor }
    const lastSent = changes[changes.length - 1]
    if (!payload.cursor || !lastSent) throw new Error('resposta do envio sem cursor')
    await this.repository.savePushCursor(CLOUD_PEER_ID, payload.cursor)
    return { count: changes.length, full: read.length >= this.batchSize || changes.length < read.length }
  }

  private async pull(after: SyncCursor): Promise<{ count: number; full: boolean }> {
    const query = new URLSearchParams({
      nodeId: this.nodeId,
      afterXid: after.xid,
      afterSeq: after.seq,
      limit: String(this.batchSize),
    })
    const response = await this.request(`/internal/sync/pull?${query.toString()}`, { method: 'GET' })
    const payload = (await response.json()) as { changes: SyncChange[]; hasMore: boolean; checksum: string }
    if (payload.checksum !== checksumOf(JSON.stringify(payload.changes))) {
      throw new Error('lote recebido corrompido (checksum)')
    }
    if (payload.changes.length === 0) return { count: 0, full: false }
    await this.repository.applyBatch({ peerId: CLOUD_PEER_ID, changes: payload.changes, cursorColumn: 'pulled' })
    return { count: payload.changes.length, full: payload.hasMore }
  }

  private async request(path: string, init: { method: 'GET' | 'POST'; body?: string }): Promise<Response> {
    const headers: Record<string, string> = { [SYNC_TOKEN_HEADER]: this.environment.SYNC_TOKEN }
    if (init.body !== undefined) {
      headers['content-type'] = 'application/json'
      headers[SYNC_CHECKSUM_HEADER] = checksumOf(init.body)
    }
    const response = await this.fetchFunction(`${this.peerUrl}${path}`, {
      method: init.method,
      headers,
      body: init.body,
      signal: AbortSignal.timeout(this.environment.SYNC_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`nuvem respondeu ${response.status} em ${path}: ${detail.slice(0, 200)}`)
    }
    return response
  }
}
