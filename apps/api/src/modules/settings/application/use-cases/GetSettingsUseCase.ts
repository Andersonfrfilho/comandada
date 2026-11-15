import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { ESTABLISHMENT_PROFILE_KEYS, LEGACY_MIN_ORDER_KEYS, MIN_ORDER_SETTING_KEY } from '../../shared/establishmentProfile.constant'

type Database = NodePgDatabase<typeof schema>

export class GetSettingsUseCase {
  constructor(private readonly db: Database) {}

  async execute(establishmentId: string): Promise<Record<string, unknown>> {
    const rows = await this.db.query.settings.findMany({
      where: eq(schema.settings.establishmentId, establishmentId),
    })

    const settings: Record<string, unknown> = Object.fromEntries(rows.map((row) => [row.key, row.value]))

    const establishment = await this.db.query.establishments.findFirst({
      where: eq(schema.establishments.id, establishmentId),
      columns: { name: true, whatsappNumber: true },
    })
    if (establishment) {
      settings[ESTABLISHMENT_PROFILE_KEYS.name] = establishment.name
      settings[ESTABLISHMENT_PROFILE_KEYS.whatsappNumber] = establishment.whatsappNumber ?? ''
    }

    if (settings[MIN_ORDER_SETTING_KEY] === undefined) {
      const legacy = LEGACY_MIN_ORDER_KEYS.map((key) => settings[key]).find((value) => value !== undefined && value !== null && value !== '')
      if (legacy !== undefined) settings[MIN_ORDER_SETTING_KEY] = legacy
    }
    return settings
  }
}
