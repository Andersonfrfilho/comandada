import { eq, and, isNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { NotFoundError } from '@/shared/errors/AppError'

export class UngroupTablesUseCase {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly createAuditLogUseCase: CreateAuditLogUseCase
  ) {}

  async execute(groupId: string, establishmentId: string, userId?: string): Promise<void> {
    const tableNumbers = await this.db.transaction(async (tx) => {
      const [closedGroup] = await tx
        .update(schema.tableGroups)
        .set({ closedAt: new Date() })
        .where(
          and(
            eq(schema.tableGroups.id, groupId),
            eq(schema.tableGroups.establishmentId, establishmentId),
            isNull(schema.tableGroups.closedAt)
          )
        )
        .returning()

      if (!closedGroup) throw new NotFoundError('Grupo de mesas')

      const ungroupedTables = await tx
        .update(schema.restaurantTables)
        .set({ groupId: null, updatedAt: new Date() })
        .where(
          and(
            eq(schema.restaurantTables.groupId, groupId),
            eq(schema.restaurantTables.establishmentId, establishmentId)
          )
        )
        .returning({ number: schema.restaurantTables.number })

      return ungroupedTables.map((table) => table.number)
    })

    await this.createAuditLogUseCase.execute({
      establishmentId,
      ...(userId ? { userId } : {}),
      action: 'table.ungrouped',
      resourceType: 'table_group',
      resourceId: groupId,
      metadata: { tableNumbers },
    })
  }
}
