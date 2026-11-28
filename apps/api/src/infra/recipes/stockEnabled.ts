import { and, eq } from 'drizzle-orm'

import { db } from '@/infra/database/connection'
import * as schema from '@/infra/database/schema'

export const STOCK_ENABLED_SETTING_KEY = 'stock.enabled'

type StockEnabledResolverDependencies = {
  readonly readExplicitSetting: (establishmentId: string) => Promise<boolean | undefined>
  readonly hasLegacyStockRows: (establishmentId: string) => Promise<boolean>
}

/**
 * Padrão provisório (a confirmar com o dono): quem já usa estoque hoje continua com ele ligado,
 * quem nunca usou começa desligado. A chave `stock.enabled` em `settings` sempre vence.
 */
export function createStockEnabledResolver(
  dependencies: StockEnabledResolverDependencies
): (establishmentId: string) => Promise<boolean> {
  return async (establishmentId) => {
    const explicitSetting = await dependencies.readExplicitSetting(establishmentId)
    if (explicitSetting !== undefined) return explicitSetting
    return dependencies.hasLegacyStockRows(establishmentId)
  }
}

async function readExplicitSetting(establishmentId: string): Promise<boolean | undefined> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(and(eq(schema.settings.establishmentId, establishmentId), eq(schema.settings.key, STOCK_ENABLED_SETTING_KEY)))
    .limit(1)
  return typeof row?.value === 'boolean' ? row.value : undefined
}

async function hasLegacyStockRows(establishmentId: string): Promise<boolean> {
  const [batch] = await db
    .select({ id: schema.stockBatches.id })
    .from(schema.stockBatches)
    .where(eq(schema.stockBatches.establishmentId, establishmentId))
    .limit(1)
  if (batch) return true
  const [movement] = await db
    .select({ id: schema.stockMovements.id })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.establishmentId, establishmentId))
    .limit(1)
  return movement !== undefined
}

export const isStockEnabledForCompany = createStockEnabledResolver({ readExplicitSetting, hasLegacyStockRows })
