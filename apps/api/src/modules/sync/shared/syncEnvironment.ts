import { z } from 'zod'

/**
 * Sincronização loja <-> nuvem. Desligada quando `SYNC_ROLE` não está definido.
 *
 * Loja:  SYNC_ROLE=loja  SYNC_NODE_NAME=yuyaki  SYNC_PEER_URL=https://api.nuvem/  SYNC_TOKEN=...
 * Nuvem: SYNC_ROLE=nuvem SYNC_TOKEN=... (o mesmo token da loja)
 */
const MINIMUM_TOKEN_LENGTH = 32

const syncEnvironmentSchema = z
  .object({
    SYNC_ROLE: z.enum(['loja', 'nuvem']),
    SYNC_NODE_NAME: z
      .string()
      .regex(/^[a-z0-9_]+$/, 'use letras minúsculas, números e _')
      .default('principal'),
    SYNC_TOKEN: z.string().min(MINIMUM_TOKEN_LENGTH, `SYNC_TOKEN precisa de ${MINIMUM_TOKEN_LENGTH}+ caracteres`),
    SYNC_PEER_URL: z.string().url().optional(),
    SYNC_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
    SYNC_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(15_000),
    SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(200),
    SYNC_MAX_BACKOFF_MS: z.coerce.number().int().min(1_000).default(60_000),
  })
  .refine((environment) => environment.SYNC_ROLE !== 'loja' || environment.SYNC_PEER_URL, {
    message: 'SYNC_PEER_URL é obrigatório na loja (endereço da API na nuvem)',
    path: ['SYNC_PEER_URL'],
  })

export type SyncEnvironment = z.infer<typeof syncEnvironmentSchema>

export function isSyncEnabled(): boolean {
  return Boolean(process.env['SYNC_ROLE'])
}

export function readSyncEnvironment(): SyncEnvironment {
  return syncEnvironmentSchema.parse(process.env)
}

/** Identificador do nó gravado em cada mudança: `loja:yuyaki` ou `nuvem:principal`. */
export function buildNodeId(environment: SyncEnvironment): string {
  return `${environment.SYNC_ROLE}:${environment.SYNC_NODE_NAME}`
}
