import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RecipeHooks } from '@adatechnology/recipe-contracts'

import * as schema from '@/infra/database/schema'

const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Database = NodePgDatabase<typeof schema>

type MirrorPreparationParams = {
  readonly companyId: string
  readonly productId: string
  readonly preparationTimeMinutes: number | null
  readonly instructions: string
}

// A ficha é a única fonte; `products.preparation_*` é cópia lida pela estimativa de tempo e pelo relatório.
async function mirrorPreparationToProduct(database: Database, params: MirrorPreparationParams): Promise<void> {
  if (!PRODUCT_ID_PATTERN.test(params.productId)) return
  await database
    .update(schema.products)
    .set({
      preparationTimeMinutes: params.preparationTimeMinutes,
      preparationInstructions: params.instructions === '' ? null : params.instructions,
    })
    .where(and(eq(schema.products.id, params.productId), eq(schema.products.establishmentId, params.companyId)))
}

// O gancho roda depois do commit e não desfaz a ficha se falhar: esta passada no boot refaz o que faltou.
export async function reconcilePreparationMirror(database: Database): Promise<number> {
  const result = await database.execute(sql`
    UPDATE products p
    SET preparation_time_minutes = r.preparation_time_minutes,
        preparation_instructions = NULLIF(r.instructions, '')
    FROM recipes.recipes r
    WHERE r.product_id = p.id::text
      AND r.company_id = p.establishment_id
      AND (p.preparation_time_minutes IS DISTINCT FROM r.preparation_time_minutes
        OR coalesce(p.preparation_instructions, '') <> r.instructions)
  `)
  return result.rowCount ?? 0
}

export function createPreparationMirrorHooks(database: Database): Pick<RecipeHooks, 'onRecipeSaved' | 'onRecipeRemoved'> {
  return {
    onRecipeSaved: ({ companyId, recipe }) =>
      mirrorPreparationToProduct(database, {
        companyId,
        productId: recipe.productId,
        preparationTimeMinutes: recipe.preparationTimeMinutes,
        instructions: recipe.instructions,
      }),
    onRecipeRemoved: ({ companyId, productId }) =>
      mirrorPreparationToProduct(database, { companyId, productId, preparationTimeMinutes: null, instructions: '' }),
  }
}
