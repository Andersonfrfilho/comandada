import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { stockModule } from '@/infra/recipes/recipeStockModules'
import { DEFAULT_EXPIRY_ALERT_DAYS, MAX_EXPIRY_ALERT_DAYS, STOCK_SETTINGS_KEY, readExpiryAlertDays } from '@/infra/recipes/stockExpiry'
import { stockExpiryQueue } from '@/infra/queue/stockQueue'
import { STOCK_EXPIRY_JOB } from '@/infra/queue/QueueNames.constant'

type Database = NodePgDatabase<typeof schema>

const SCAN_CRON = '0 8 * * *'

/**
 * Varre os lotes que vencem pelo módulo de estoque, na maior janela configurada; o gancho `onBatchesExpiring`
 * (infra/recipes/stockExpiry.ts) grava o aviso de cada restaurante dentro da janela dele.
 */
export async function scanExpiringBatches(database: Database): Promise<{ alerted: number }> {
  const settingsRows = await database
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, STOCK_SETTINGS_KEY))

  const withinDays = Math.min(
    settingsRows.reduce((widest, row) => Math.max(widest, readExpiryAlertDays(row.value)), DEFAULT_EXPIRY_ALERT_DAYS),
    MAX_EXPIRY_ALERT_DAYS
  )

  const result = await stockModule.useCases.scanExpiringBatches.execute({ withinDays })

  console.log(`[StockExpiryAlerter] ${result.batches} expiring batch(es) found in ${result.companies} company(ies) (widest alert window: ${withinDays}d)`)
  return { alerted: result.batches }
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
