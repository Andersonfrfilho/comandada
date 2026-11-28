import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { runRecipeMigrations } from '@adatechnology/recipe-module'
import { runStockMigrations } from '@adatechnology/stock-module'

import type * as schema from './schema'

// Precisa rodar antes do `migrate` do Drizzle: a migration 0061 copia dados para os schemas `recipes` e `stock`.
export async function runRecipeStockMigrations(params: { readonly db: NodePgDatabase<typeof schema> }): Promise<void> {
  await runRecipeMigrations({ db: params.db, migrate })
  await runStockMigrations({ db: params.db, migrate })
}
