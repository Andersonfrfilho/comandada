import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { financeDueQueue } from '@/infra/queue/financeQueue'
import { FINANCE_DUE_JOB } from '@/infra/queue/QueueNames.constant'

type Database = NodePgDatabase<typeof schema>

const DUE_ALERT_DAYS = 5
const SCAN_CRON = '0 9 * * *'

export async function scanDueAccounts(database: Database): Promise<{ alerted: number }> {
  const today = new Date()
  const cutoffDay = today.getDate() + DUE_ALERT_DAYS

  const accounts = await database
    .select()
    .from(schema.monthlyAccounts)
    .where(eq(schema.monthlyAccounts.status, 'pending'))

  const dueAccounts = accounts.filter((account) => {
    if (cutoffDay > 28) {
      return account.dueDay >= today.getDate() && account.dueDay <= cutoffDay
    }
    return account.dueDay >= today.getDate() && account.dueDay <= cutoffDay
  })

  for (const account of dueAccounts) {
    await database.insert(schema.auditLogs).values({
      establishmentId: account.establishmentId,
      action: 'account_due_alert',
      resourceType: 'monthly_account',
      resourceId: account.id,
      metadata: {
        description: account.description,
        category: account.category,
        amount: account.amount,
        dueDay: account.dueDay,
        recurrence: account.recurrence,
        alertDate: today.toISOString().split('T')[0],
        daysUntilDue: account.dueDay - today.getDate() + (account.dueDay < today.getDate() ? 31 : 0),
      },
    })
  }

  console.log(`[AccountDueAlerter] ${dueAccounts.length} account(s) due within ${DUE_ALERT_DAYS} days`)
  return { alerted: dueAccounts.length }
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
