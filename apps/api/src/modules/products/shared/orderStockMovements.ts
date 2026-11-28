import { sql } from 'drizzle-orm'
import { movements } from '@adatechnology/stock-module'

export const ORDER_DEDUCTION_KEY_PREFIX = 'order:'
export const ORDER_RETURN_KEY_PREFIX = 'order-return:'
// A migração 0061 grava a devolução antiga como entrada com a mesma chave `order:<pedido>:legacy` da baixa antiga.
export const LEGACY_ORDER_KEY_SUFFIX = ':legacy'

/** Baixa de pedido: saída gravada pela ficha. */
export const orderDeductionCondition = sql`${movements.kind} = 'out'`

/** Devolução por cancelamento: entrada ligada a pedido (nova, `order-return:`, ou migrada, `order:…:legacy`). */
export const orderReturnCondition = sql`(${movements.kind} = 'in' AND (${movements.sourceKey} LIKE ${`${ORDER_RETURN_KEY_PREFIX}%`} OR ${movements.sourceKey} LIKE ${`${ORDER_DEDUCTION_KEY_PREFIX}%${LEGACY_ORDER_KEY_SUFFIX}`}))`
