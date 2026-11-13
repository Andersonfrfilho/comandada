import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

interface UpsertSettingInput {
  establishmentId: string
  key: string
  value: unknown
}

export class UpsertSettingUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: UpsertSettingInput) {
    const [row] = await this.db
      .insert(schema.settings)
      .values({
        establishmentId: input.establishmentId,
        key: input.key,
        value: input.value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.settings.establishmentId, schema.settings.key],
        set: { value: input.value, updatedAt: new Date() },
      })
      .returning()

    return row!
  }
}
