import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

interface AuditLogInput {
  establishmentId: string
  userId?: string
  action: string
  resourceType: string
  resourceId?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

export class CreateAuditLogUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: AuditLogInput): Promise<void> {
    await this.db.insert(schema.auditLogs).values({
      establishmentId: input.establishmentId,
      userId: input.userId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
    })
  }
}
