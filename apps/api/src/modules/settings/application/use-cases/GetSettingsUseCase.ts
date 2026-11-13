import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

export class GetSettingsUseCase {
  constructor(private readonly db: Database) {}

  async execute(establishmentId: string): Promise<Record<string, unknown>> {
    const rows = await this.db.query.settings.findMany({
      where: eq(schema.settings.establishmentId, establishmentId),
    })

    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  }
}
