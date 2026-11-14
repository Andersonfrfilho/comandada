import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { BRANDING_SETTING_KEYS } from '../../shared/branding.constant'
import { ESTABLISHMENT_LOCATION_SETTING_KEYS } from '../../shared/establishmentLocation.constant'
import { removeLogoBackgroundFromDataUrl } from '../services/removeLogoBackground'

type Database = NodePgDatabase<typeof schema>

interface UpsertSettingInput {
  establishmentId: string
  key: string
  value: unknown
}

export class UpsertSettingUseCase {
  constructor(private readonly db: Database) {}

  async execute(rawInput: UpsertSettingInput) {
    const input = await withLogoBackgroundRemoved(rawInput)
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

    // Latitude/longitude digitadas no painel valem mais que as calculadas pelo endereço.
    if (input.key === ESTABLISHMENT_LOCATION_SETTING_KEYS.latitude || input.key === ESTABLISHMENT_LOCATION_SETTING_KEYS.longitude) {
      await this.db
        .delete(schema.settings)
        .where(
          and(
            eq(schema.settings.establishmentId, input.establishmentId),
            eq(schema.settings.key, ESTABLISHMENT_LOCATION_SETTING_KEYS.geocodedFor)
          )
        )
    }

    return row!
  }
}

// Logo novo entra sem o fundo liso, para aparecer bem sobre qualquer cor (login, menu, rodapé, figurinha).
async function withLogoBackgroundRemoved(input: UpsertSettingInput): Promise<UpsertSettingInput> {
  if (input.key !== BRANDING_SETTING_KEYS.logo || typeof input.value !== 'string' || input.value.trim() === '') return input
  return { ...input, value: await removeLogoBackgroundFromDataUrl(input.value) }
}
