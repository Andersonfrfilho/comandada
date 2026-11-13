import { and, eq, lte, gt } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { stockExpiryQueue } from '@/infra/queue/stockQueue'
import { STOCK_EXPIRY_JOB } from '@/infra/queue/QueueNames.constant'

type Database = NodePgDatabase<typeof schema>

const DEFAULT_EXPIRY_ALERT_DAYS = 7
const SCAN_CRON = '0 8 * * *'

export async function scanExpiringBatches(database: Database): Promise<{ alerted: number }> {
  const settingsRows = await database
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, 'stock'))
    .limit(1)

  const stockSettings = (settingsRows[0]?.value as Record<string, unknown>) ?? {}
  const alertDays = (stockSettings.expiry_alert_days as number) ?? DEFAULT_EXPIRY_ALERT_DAYS

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() + alertDays)

  const expiringBatches = await database
    .select()
    .from(schema.stockBatches)
    .where(
      and(
        lte(schema.stockBatches.expiresAt, cutoffDate),
        gt(schema.stockBatches.remainingQuantity, '0')
      )
    )

  for (const batch of expiringBatches) {
    await database.insert(schema.auditLogs).values({
      establishmentId: batch.establishmentId,
      action: 'stock_expiry_alert',
      resourceType: 'stock_batch',
      resourceId: batch.id,
      metadata: {
        batchNumber: batch.batchNumber,
        ingredientId: batch.ingredientId,
        expiresAt: batch.expiresAt,
        remainingQuantity: batch.remainingQuantity,
      },
    })
  }

  console.log(`[StockExpiryAlerter] ${expiringBatches.length} expiring batch(es) found (alert threshold: ${alertDays}d)`)
  return { alerted: expiringBatches.length }
}

export async function scheduleStockExpiryScan(): Promise<void> {
  await stockExpiryQueue.add(
    STOCK_EXPIRY_JOB.SCAN_EXPIRING,
    {},
    {
      repeat: { pattern: SCAN_CRON },
      jobId: 'stock-expiry-scan',
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    }
  )
}
