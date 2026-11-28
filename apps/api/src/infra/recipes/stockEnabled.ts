import { and, eq, ne } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { batches as stockBatches, levels as stockLevels, movements as stockMovements } from '@adatechnology/stock-module'

import { db } from '@/infra/database/connection'
import * as schema from '@/infra/database/schema'

export const STOCK_ENABLED_SETTING_KEY = 'stock.enabled'

type StockEnabledResolverDependencies = {
  readonly readExplicitSetting: (establishmentId: string) => Promise<boolean | undefined>
  readonly hasStockRows: (establishmentId: string) => Promise<boolean>
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
    return dependencies.hasStockRows(establishmentId)
  }
}

type Database = NodePgDatabase<typeof schema>

export type StockEnabledChecks = {
  readonly isStockEnabledForCompany: (establishmentId: string) => Promise<boolean>
  /**
   * Rotas antigas de estoque são o ponto de entrada de quem começa a usar: a primeira escrita liga o
   * estoque, salvo se a empresa o desligou de propósito (`stock.enabled = false`).
   */
  readonly ensureStockEnabledForCompany: (establishmentId: string) => Promise<void>
}

export function createStockEnabledChecks(database: Database): StockEnabledChecks {
  async function readExplicitSetting(establishmentId: string): Promise<boolean | undefined> {
    const [row] = await database
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(and(eq(schema.settings.establishmentId, establishmentId), eq(schema.settings.key, STOCK_ENABLED_SETTING_KEY)))
      .limit(1)
    return typeof row?.value === 'boolean' ? row.value : undefined
  }

  async function hasStockRows(establishmentId: string): Promise<boolean> {
    const [batch] = await database.select({ id: stockBatches.id }).from(stockBatches).where(eq(stockBatches.companyId, establishmentId)).limit(1)
    if (batch) return true
    const [movement] = await database.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.companyId, establishmentId)).limit(1)
    if (movement) return true
    const [level] = await database
      .select({ ingredientId: stockLevels.ingredientId })
      .from(stockLevels)
      .where(and(eq(stockLevels.companyId, establishmentId), ne(stockLevels.quantity, '0')))
      .limit(1)
    return level !== undefined
  }

  const isStockEnabledForCompany = createStockEnabledResolver({ readExplicitSetting, hasStockRows })

  async function ensureStockEnabledForCompany(establishmentId: string): Promise<void> {
    if (await isStockEnabledForCompany(establishmentId)) return
    if ((await readExplicitSetting(establishmentId)) === false) return
    await database
      .insert(schema.settings)
      .values({ establishmentId, key: STOCK_ENABLED_SETTING_KEY, value: true })
      .onConflictDoUpdate({ target: [schema.settings.establishmentId, schema.settings.key], set: { value: true, updatedAt: new Date() } })
  }

  return { isStockEnabledForCompany, ensureStockEnabledForCompany }
}

const checks = createStockEnabledChecks(db)

export const isStockEnabledForCompany = checks.isStockEnabledForCompany
export const ensureStockEnabledForCompany = checks.ensureStockEnabledForCompany
