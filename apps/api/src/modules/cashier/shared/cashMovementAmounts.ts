import { sql } from 'drizzle-orm'
import * as schema from '@/infra/database/schema'

// Valor do lançamento com sinal para faturamento: pagamento soma, devolução (estorno) subtrai.
// Use junto com `type IN ('payment', 'refund')`.
export const netCashAmount = sql`CASE WHEN ${schema.cashMovements.type} = 'refund' THEN -${schema.cashMovements.amount} ELSE ${schema.cashMovements.amount} END`
