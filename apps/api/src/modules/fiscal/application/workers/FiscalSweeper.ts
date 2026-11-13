import { and, eq, inArray, lt } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { fiscalQueue } from '@/infra/queue/fiscalQueue'
import { FISCAL_JOB } from '@/infra/queue/QueueNames.constant'

type Database = NodePgDatabase<typeof schema>

const SWEEP_INTERVAL_MS = Number(process.env.FISCAL_SWEEP_INTERVAL_MS ?? 120_000)
const STALE_EMITTING_MS = 5 * 60_000
const REENQUEUE_BATCH = 100

// Codes that prove the request NEVER reached SEFAZ (connection-level failures). Only these are
// safe to auto-re-emit: there is no risk of a duplicate authorized invoice. A timeout is NOT here
// on purpose — it is ambiguous (the request may have been received) and must be reviewed by a human.
const SAFE_TO_REEMIT_CODES = [
  'FISCAL_CONNECTION_ERROR',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
] as const

const NEEDS_REVIEW_CODE = 'NEEDS_REVIEW'

// Offline-resilience backstop. Re-drives ONLY documents that provably have no SEFAZ counterpart yet,
// so it can never produce a duplicate invoice. Ambiguous cases are surfaced for manual review instead.
// Full auto-recovery of ambiguous cases (timeout after the request reached SEFAZ) requires a SEFAZ
// reconciliation query (consulta por chave/protocolo) before re-emit — tracked as a production gate.
export async function runFiscalSweep(database: Database): Promise<{ reenqueued: number }> {
  const staleThreshold = new Date(Date.now() - STALE_EMITTING_MS)

  // Crash mid-emit: we cannot know whether SEFAZ received it, so DO NOT auto re-emit — flag for review.
  await database
    .update(schema.fiscalDocuments)
    .set({
      status: 'rejected',
      errorCode: NEEDS_REVIEW_CODE,
      errorMessage: 'Emissão interrompida — verifique na SEFAZ antes de reemitir',
      updatedAt: new Date(),
    })
    .where(and(eq(schema.fiscalDocuments.status, 'emitting'), lt(schema.fiscalDocuments.lastAttemptAt, staleThreshold)))

  // Offline recovery: retries exhausted on a connection-level failure (request never left the box).
  // Safe to make claimable again — the atomic claim in FiscalEmissionService prevents double-emit.
  await database
    .update(schema.fiscalDocuments)
    .set({ status: 'pending', errorCode: null, errorMessage: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.fiscalDocuments.status, 'rejected'),
        inArray(schema.fiscalDocuments.errorCode, [...SAFE_TO_REEMIT_CODES])
      )
    )

  const pending = await database.query.fiscalDocuments.findMany({
    where: eq(schema.fiscalDocuments.status, 'pending'),
    orderBy: (documents, { asc }) => [asc(documents.createdAt)],
    limit: REENQUEUE_BATCH,
    columns: { id: true, establishmentId: true },
  })

  await Promise.all(
    pending.map((document) =>
      fiscalQueue.add(FISCAL_JOB.EMIT, {
        fiscalDocumentId: document.id,
        establishmentId: document.establishmentId,
      })
    )
  )

  return { reenqueued: pending.length }
}

// Register the recurring sweep as a BullMQ repeatable job. The stable jobId keeps a single scheduler
// for a given interval (changing FISCAL_SWEEP_INTERVAL_MS creates a new repeat key — clean up the old
// one on interval changes, or migrate to upsertJobScheduler when the queue typing allows).
export async function scheduleFiscalSweep(): Promise<void> {
  await fiscalQueue.add(
    FISCAL_JOB.SWEEP,
    {},
    {
      repeat: { every: SWEEP_INTERVAL_MS },
      jobId: 'fiscal-sweep',
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 50 },
    }
  )
}
