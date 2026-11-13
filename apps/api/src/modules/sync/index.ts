import type { Pool } from 'pg'
import type { Router } from '@/infra/http/router'
import { SyncWorker } from './application/SyncWorker'
import { SyncRepository, type SyncChange } from './infra/SyncRepository'
import { SyncController } from './infra/http/SyncController'
import { registerDisabledSyncRoutes, registerSyncRoutes } from './infra/http/SyncRoutes'
import { buildNodeId, isSyncEnabled, readSyncEnvironment } from './shared/syncEnvironment'
import { SYNC_TABLES } from './shared/syncTables.constant'

export interface SyncModule {
  stop(): Promise<void>
}

/**
 * Liga a sincronização loja <-> nuvem quando SYNC_ROLE está definido. Configura o banco (triggers,
 * faixa de ids), registra as rotas e, na loja, inicia o worker que conversa com a nuvem.
 */
export interface SyncHooks {
  /** Na nuvem: mudanças que chegaram da loja e foram aplicadas. */
  readonly onRemoteChanges?: (changes: readonly SyncChange[]) => Promise<void>
}

export async function startSyncModule(router: Router, pool: Pool, hooks: SyncHooks = {}): Promise<SyncModule> {
  if (!isSyncEnabled()) {
    registerDisabledSyncRoutes(router)
    return { stop: async () => undefined }
  }

  const environment = readSyncEnvironment()
  const nodeId = buildNodeId(environment)
  const repository = new SyncRepository(pool)

  const missingTables = await repository.configure(nodeId, environment.SYNC_ROLE, SYNC_TABLES)
  if (missingTables.length > 0) console.warn(`[Sync] tabelas ausentes, ignoradas: ${missingTables.join(', ')}`)
  const seeded = await repository.seedBacklog()
  if (seeded > 0) console.log(`[Sync] ${seeded} linhas existentes entraram na fila de sincronização`)

  registerSyncRoutes(router, new SyncController(repository, environment, nodeId, hooks.onRemoteChanges), environment.SYNC_TOKEN)

  if (environment.SYNC_ROLE !== 'loja') {
    console.log(`[Sync] ligado como ${nodeId}, aguardando a loja`)
    return { stop: async () => undefined }
  }

  const worker = new SyncWorker({ repository, environment, nodeId })
  worker.start()
  console.log(`[Sync] ligado como ${nodeId}, sincronizando com ${environment.SYNC_PEER_URL}`)
  return { stop: () => worker.stop() }
}
