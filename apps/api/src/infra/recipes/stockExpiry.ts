import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { ExpiringBatch, StockHooks } from '@adatechnology/stock-contracts'

import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

export const DEFAULT_EXPIRY_ALERT_DAYS = 7
export const MAX_EXPIRY_ALERT_DAYS = 365
export const STOCK_SETTINGS_KEY = 'stock'
const STOCK_EXPIRY_ALERT_ACTION = 'stock_expiry_alert'
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

export function readExpiryAlertDays(settingsValue: unknown): number {
  if (typeof settingsValue !== 'object' || settingsValue === null) return DEFAULT_EXPIRY_ALERT_DAYS
  const days = (settingsValue as Record<string, unknown>)['expiry_alert_days']
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 1) return DEFAULT_EXPIRY_ALERT_DAYS
  return Math.min(Math.floor(days), MAX_EXPIRY_ALERT_DAYS)
}

export async function findExpiryAlertDays(database: Database, establishmentId: string): Promise<number> {
  const [row] = await database
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(and(eq(schema.settings.establishmentId, establishmentId), eq(schema.settings.key, STOCK_SETTINGS_KEY)))
    .limit(1)
  return readExpiryAlertDays(row?.value)
}

export function selectBatchesWithinDays(params: {
  readonly batches: readonly ExpiringBatch[]
  readonly days: number
  readonly now: Date
}): ExpiringBatch[] {
  const cutoff = params.now.getTime() + params.days * DAY_IN_MILLISECONDS
  return params.batches.filter((batch) => batch.expiresAt !== null && new Date(batch.expiresAt).getTime() <= cutoff)
}

// A varredura do módulo usa a maior janela; cada restaurante só recebe o aviso dentro da sua (`settings.stock.expiry_alert_days`).
export function createStockExpiryHooks(database: Database): Pick<StockHooks, 'onBatchesExpiring'> {
  return {
    onBatchesExpiring: async ({ companyId, batches }) => {
      const days = await findExpiryAlertDays(database, companyId)
      const dueBatches = selectBatchesWithinDays({ batches, days, now: new Date() })
      if (dueBatches.length === 0) return
      await database.insert(schema.auditLogs).values(
        dueBatches.map((batch) => ({
          establishmentId: companyId,
          action: STOCK_EXPIRY_ALERT_ACTION,
          resourceType: 'stock_batch',
          resourceId: batch.id,
          metadata: {
            batchNumber: batch.batchCode,
            ingredientId: batch.ingredientId,
            expiresAt: batch.expiresAt,
            remainingQuantity: batch.remainingQuantity,
          },
        }))
      )
    },
  }
}
