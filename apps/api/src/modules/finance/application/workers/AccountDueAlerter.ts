import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { daysUntilDue } from '@adatechnology/expense-module'
import * as schema from '@/infra/database/schema'
import { expenseModule } from '@/infra/expenses/expenseModule'
import { financeDueQueue } from '@/infra/queue/financeQueue'
import { FINANCE_DUE_JOB } from '@/infra/queue/QueueNames.constant'

type Database = NodePgDatabase<typeof schema>

const SCAN_CRON = '0 9 * * *'
/** O alerta vai para o histórico do restaurante (auditoria), não para uma pessoa. */
const ALERT_RECIPIENT = 'establishment'
const ALERT_CHANNEL = 'audit'

/**
 * Varredura diária das contas a pagar: completa os vencimentos das contas fixas e registra o alerta de cada conta
 * que vence em 3 dias, vence hoje ou está em atraso (regra do `@adatechnology/expense-module`). A marca de enviado
 * do módulo impede o mesmo alerta duas vezes no mesmo dia.
 */
export async function scanDueAccounts(database: Database): Promise<{ alerted: number }> {
  await expenseModule.expenses.generateOccurrences()
  const today = expenseModule.clock.today()
  const candidates = await expenseModule.expenses.listReminderCandidates()
  let alerted = 0
  for (const candidate of candidates) {
    const { occurrence } = candidate
    const claimed = await expenseModule.expenses.claimReminderDelivery({
      channel: ALERT_CHANNEL,
      companyId: occurrence.companyId,
      kind: candidate.kind,
      occurrenceId: occurrence.id,
      recipientRef: ALERT_RECIPIENT,
    })
    if (!claimed) continue
    await database.insert(schema.auditLogs).values({
      establishmentId: occurrence.companyId,
      action: 'account_due_alert',
      resourceType: 'expense_occurrence',
      resourceId: occurrence.id,
      metadata: {
        description: occurrence.expenseName,
        category: occurrence.categoryName,
        amount: occurrence.expectedAmount,
        dueDate: occurrence.dueDate,
        reminderKind: candidate.kind,
        alertDate: today,
        daysUntilDue: daysUntilDue({ dueDate: occurrence.dueDate, today }),
      },
    })
    alerted += 1
  }

  console.log(`[AccountDueAlerter] ${alerted} alerta(s) de conta a pagar`)
  return { alerted }
}

export async function scheduleAccountDueScan(): Promise<void> {
  await financeDueQueue.add(
    FINANCE_DUE_JOB.SCAN_DUE_ACCOUNTS,
    {},
    {
      repeat: { pattern: SCAN_CRON },
      jobId: 'account-due-scan',
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    }
  )
}
