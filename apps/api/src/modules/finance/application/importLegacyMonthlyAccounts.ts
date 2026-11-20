import { and, eq, like } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { competenceBounds, competenceOfDate, type ExpenseModule, type ExpenseRecurrence } from '@adatechnology/expense-module'
import { expenses as moduleExpenses } from '@adatechnology/expense-module/schema'

import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

/** Categoria antiga (texto fixo) → nome da categoria padrão do módulo. */
const LEGACY_CATEGORY_NAMES: Record<string, string> = {
  aluguel: 'Aluguel',
  energia: 'Energia',
  agua: 'Água',
  internet: 'Internet e telefone',
  telefone: 'Internet e telefone',
  salarios: 'Salários e encargos',
  impostos: 'Impostos e taxas',
  marketing: 'Marketing',
  manutencao: 'Manutenção',
  outros: 'Outros',
}

const LEGACY_RECURRENCES = new Set<ExpenseRecurrence>(['monthly', 'bimonthly', 'yearly'])

/** Marca da conta copiada: fica nas observações e torna a cópia idempotente. */
export function legacyMarker(legacyId: string): string {
  return `[contas-mensais:${legacyId}]`
}

/**
 * Copia as "Contas fixas" antigas (`monthly_accounts`) para o módulo de contas a pagar, uma vez por conta.
 * Nada é apagado: a tabela antiga fica como estava. A conta paga no mês corrente entra com o vencimento do mês pago.
 */
export async function importLegacyMonthlyAccounts(params: {
  readonly database: Database
  readonly module: ExpenseModule
}): Promise<{ readonly imported: number }> {
  const { database, module } = params
  const legacy = await database.select().from(schema.monthlyAccounts)
  let imported = 0
  for (const account of legacy) {
    const marker = legacyMarker(account.id)
    const [existing] = await database
      .select({ id: moduleExpenses.id })
      .from(moduleExpenses)
      .where(and(eq(moduleExpenses.companyId, account.establishmentId), like(moduleExpenses.notes, `%${marker}%`)))
      .limit(1)
    if (existing) continue

    const categories = await module.expenses.listCategories({ companyId: account.establishmentId })
    const wanted = LEGACY_CATEGORY_NAMES[account.category] ?? 'Outros'
    const category = categories.find((item) => item.name === wanted) ?? categories.find((item) => item.name === 'Outros') ?? categories[0]
    if (!category) continue

    const recurrence = LEGACY_RECURRENCES.has(account.recurrence as ExpenseRecurrence)
      ? (account.recurrence as ExpenseRecurrence)
      : 'monthly'
    const notes = [account.notes?.trim(), marker].filter((part) => part !== undefined && part !== '').join('\n')
    const { expense } = await module.expenses.createExpense({
      companyId: account.establishmentId,
      createdVia: 'api',
      expense: {
        anchorCompetence: competenceOfDate(account.createdAt.toISOString().slice(0, 10)),
        categoryId: category.id,
        dueDay: Math.min(Math.max(account.dueDay, 1), 31),
        expectedAmount: account.amount,
        kind: 'fixed',
        name: account.description,
        notes,
        recurrence,
      },
    })

    if (account.status === 'paid' && account.paidAt !== null) {
      const paidAt = account.paidAt.toISOString().slice(0, 10)
      const [occurrence] = await module.expenses.listOccurrences({
        companyId: account.establishmentId,
        expenseId: expense.id,
        ...competenceBounds(paidAt.slice(0, 7)),
        status: ['open'],
      })
      if (occurrence) {
        await module.expenses.settleOccurrence({ companyId: account.establishmentId, id: occurrence.id, paidAt })
      }
    }
    imported += 1
  }
  return { imported }
}
