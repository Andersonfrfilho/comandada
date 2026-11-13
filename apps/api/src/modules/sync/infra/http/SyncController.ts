import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import { NotFoundError, ValidationError } from '@/shared/errors/AppError'
import { CLOUD_PEER_ID, checksumOf } from '../../application/SyncWorker'
import type { SyncChange, SyncRepository } from '../SyncRepository'
import type { SyncEnvironment } from '../../shared/syncEnvironment'

const NODE_ID_PATTERN = /^(loja|nuvem):[a-z0-9_]+$/
const MAX_CHANGES_PER_REQUEST = 1_000
const CONFLICT_LIST_LIMIT = 100
/** Sem sucesso por este tanto de intervalos, o painel mostra "offline". */
const OFFLINE_AFTER_INTERVALS = 4

const cursorPart = z.string().regex(/^\d+$/)

const changeSchema = z.object({
  seq: cursorPart,
  xid: cursorPart,
  table_name: z.string().min(1),
  pk: z.string(),
  key: z.record(z.unknown()),
  op: z.enum(['I', 'U', 'D']),
  data: z.record(z.unknown()).nullable(),
  old_data: z.record(z.unknown()).nullable(),
  hlc: z.string().regex(/^\d{15}-\d{12}-/),
  origin: z.string().regex(NODE_ID_PATTERN),
})

const pushSchema = z.object({
  nodeId: z.string().regex(NODE_ID_PATTERN),
  changes: z.array(changeSchema).max(MAX_CHANGES_PER_REQUEST),
})

const pullSchema = z.object({
  nodeId: z.string().regex(NODE_ID_PATTERN),
  afterXid: cursorPart.default('0'),
  afterSeq: cursorPart.default('0'),
  limit: z.coerce.number().int().min(1).max(MAX_CHANGES_PER_REQUEST).default(200),
})

export class SyncController {
  constructor(
    private readonly repository: SyncRepository,
    private readonly environment: SyncEnvironment,
    private readonly nodeId: string,
    private readonly onRemoteChanges?: (changes: readonly SyncChange[]) => Promise<void>
  ) {}

  /** Nuvem recebe as mudanças da loja. Reenvio do mesmo lote é ignorado. */
  push: RouteHandler = async (request, response) => {
    const parsed = pushSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Lote inválido', parsed.error.flatten())
    const { nodeId, changes } = parsed.data
    if (changes.some((change) => change.origin !== nodeId)) {
      throw new ValidationError('Um nó só pode enviar as próprias mudanças')
    }
    const result = await this.repository.applyBatch({ peerId: nodeId, changes, cursorColumn: 'received' })
    // Depois de gravado: um aviso que falha não pode desfazer nem travar a sincronização.
    if (this.onRemoteChanges && result.appliedChanges.length > 0) {
      this.onRemoteChanges(result.appliedChanges).catch((error: unknown) =>
        console.error('[Sync] after-apply hook failed:', error instanceof Error ? error.message : error)
      )
    }
    const peer = await this.repository.getPeer(nodeId)
    response.json({
      cursor: peer.lastReceived,
      applied: result.applied,
      skipped: result.skipped,
      conflicts: result.conflicts,
    })
  }

  /** Loja puxa o que a nuvem tem e ela ainda não viu (tudo que não nasceu nela). */
  pull: RouteHandler = async (request, response) => {
    const parsed = pullSchema.safeParse(request.query)
    if (!parsed.success) throw new ValidationError('Parâmetros inválidos', parsed.error.flatten())
    const { nodeId, afterXid, afterSeq, limit } = parsed.data
    const changes = await this.repository.readChanges({
      after: { xid: afterXid, seq: afterSeq },
      limit: limit + 1,
      exceptOrigin: nodeId,
    })
    const page = changes.slice(0, limit)
    await this.repository.getPeer(nodeId)
    await this.repository.recordAttempt(nodeId, null)
    response.json({ changes: page, hasMore: changes.length > limit, checksum: checksumOf(JSON.stringify(page)) })
  }

  status: RouteHandler = async (_request, response) => {
    const peerId = this.environment.SYNC_ROLE === 'loja' ? CLOUD_PEER_ID : null
    const peer = peerId ? await this.repository.getPeer(peerId) : null
    const pendingPush = peer ? await this.repository.countPendingPush(this.nodeId, peer.lastPushed) : 0
    const conflicts = await this.repository.countConflicts()
    const offlineThresholdMs = this.environment.SYNC_INTERVAL_MS * OFFLINE_AFTER_INTERVALS + this.environment.SYNC_REQUEST_TIMEOUT_MS
    const online = peer?.lastSuccessAt ? Date.now() - peer.lastSuccessAt.getTime() < offlineThresholdMs : peerId === null
    response.json({
      enabled: true,
      role: this.environment.SYNC_ROLE,
      nodeId: this.nodeId,
      online,
      lastSuccessAt: peer?.lastSuccessAt ?? null,
      lastAttemptAt: peer?.lastAttemptAt ?? null,
      lastError: peer?.lastError ?? null,
      pendingPush,
      conflicts,
    })
  }

  listConflicts: RouteHandler = async (_request, response) => {
    response.json({ data: await this.repository.listConflicts(CONFLICT_LIST_LIMIT) })
  }

  acceptConflict: RouteHandler = async (request, response) => {
    const conflictId = request.params['id'] ?? ''
    if (!/^\d+$/.test(conflictId)) throw new ValidationError('id inválido')
    if (!(await this.repository.acceptConflict(conflictId))) throw new NotFoundError('Conflito')
    response.json({ ok: true })
  }

  discardConflict: RouteHandler = async (request, response) => {
    const conflictId = request.params['id'] ?? ''
    if (!/^\d+$/.test(conflictId)) throw new ValidationError('id inválido')
    if (!(await this.repository.discardConflict(conflictId))) throw new NotFoundError('Conflito')
    response.json({ ok: true })
  }
}

/** Resposta do status quando a sincronização está desligada neste servidor. */
export const disabledSyncStatus: RouteHandler = async (_request, response) => {
  response.json({ enabled: false })
}
