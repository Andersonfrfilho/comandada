import { eq, and, inArray, isNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { ConflictError, NotFoundError } from '@/shared/errors/AppError'

export interface GroupTablesResult {
  id: string
  tableIds: string[]
}

export class GroupTablesUseCase {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly tableRepository: TableRepository,
    private readonly createAuditLogUseCase: CreateAuditLogUseCase
  ) {}

  async execute(establishmentId: string, tableIds: string[], userId?: string): Promise<GroupTablesResult> {
    const uniqueIds = [...new Set(tableIds)]
    if (uniqueIds.length < 2) {
      throw new ConflictError('Selecione ao menos 2 mesas para juntar')
    }

    const tables = await Promise.all(
      uniqueIds.map((id) => this.tableRepository.findById(id, establishmentId))
    )

    tables.forEach((table, index) => {
      if (!table) throw new NotFoundError(`Mesa ${uniqueIds[index]}`)
      if (table.groupId) throw new ConflictError(`Mesa ${table.number} já está em outro grupo`)
    })

    const group = await this.db.transaction(async (tx) => {
      const [insertedGroup] = await tx
        .insert(schema.tableGroups)
        .values({ establishmentId })
        .returning()

      // O filtro por groupId nulo é o que serializa duas junções simultâneas:
      // a segunda transação atinge menos linhas e aborta.
      const grouped = await tx
        .update(schema.restaurantTables)
        .set({ groupId: insertedGroup!.id, updatedAt: new Date() })
        .where(
          and(
            inArray(schema.restaurantTables.id, uniqueIds),
            eq(schema.restaurantTables.establishmentId, establishmentId),
            isNull(schema.restaurantTables.groupId)
          )
        )
        .returning({ id: schema.restaurantTables.id })

      if (grouped.length !== uniqueIds.length) {
        throw new ConflictError('Alguma das mesas selecionadas já entrou em outro grupo')
      }

      return insertedGroup!
    })

    await this.createAuditLogUseCase.execute({
      establishmentId,
      ...(userId ? { userId } : {}),
      action: 'table.grouped',
      resourceType: 'table_group',
      resourceId: group.id,
      metadata: { tableIds: uniqueIds, tableNumbers: tables.map((table) => table!.number) },
    })

    return { id: group.id, tableIds: uniqueIds }
  }
}
