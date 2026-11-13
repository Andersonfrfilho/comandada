import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import { ORDER_ISSUE_STATUS } from '../../shared/issues.constant'

type Database = NodePgDatabase<typeof schema>

export class ResolveOrderIssueUseCase {
  constructor(private readonly db: Database) {}

  async execute(params: { issueId: string; establishmentId: string; userId: string }) {
    const [updated] = await this.db
      .update(schema.orderIssues)
      .set({ status: ORDER_ISSUE_STATUS.resolved, resolvedAt: new Date(), resolvedByUserId: params.userId })
      .where(and(eq(schema.orderIssues.id, params.issueId), eq(schema.orderIssues.establishmentId, params.establishmentId)))
      .returning()
    if (!updated) throw new NotFoundError('OrderIssue')
    return updated
  }
}
