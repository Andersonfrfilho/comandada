import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { BRANDING_SETTING_KEYS } from '../../shared/branding.constant'
import { ESTABLISHMENT_LOCATION_SETTING_KEYS } from '../../shared/establishmentLocation.constant'
import { removeLogoBackgroundFromDataUrl } from '../services/removeLogoBackground'
import { ESTABLISHMENT_PROFILE_KEYS } from '../../shared/establishmentProfile.constant'
import { ConflictError, ValidationError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

interface UpsertSettingInput {
  establishmentId: string
  key: string
  value: unknown
}

export class UpsertSettingUseCase {
  constructor(private readonly db: Database) {}

  async execute(rawInput: UpsertSettingInput) {
    if (rawInput.key === ESTABLISHMENT_PROFILE_KEYS.name || rawInput.key === ESTABLISHMENT_PROFILE_KEYS.whatsappNumber) {
      return this.updateEstablishmentProfile(rawInput)
    }
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

  private async updateEstablishmentProfile(input: UpsertSettingInput) {
    const text = typeof input.value === 'string' ? input.value.trim() : ''
    const changes: Partial<schema.NewEstablishment> = { updatedAt: new Date() }
    if (input.key === ESTABLISHMENT_PROFILE_KEYS.name) {
      if (text.length < 2) throw new ValidationError('Informe o nome do estabelecimento')
      changes.name = text
    } else {
      const digits = text.replace(/\D/g, '')
      if (digits !== '' && (digits.length < 10 || digits.length > 15)) {
        throw new ValidationError('WhatsApp com DDI e DDD, só números. Ex.: 5511999999999')
      }
      changes.whatsappNumber = digits === '' ? null : digits
    }
    try {
      await this.db.update(schema.establishments).set(changes).where(eq(schema.establishments.id, input.establishmentId))
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
      if (error instanceof Error && /unique|duplicate/i.test(`${error.message} ${cause}`)) {
        throw new ConflictError('Este WhatsApp já está ligado a outro estabelecimento')
      }
      throw error
    }
    return { establishmentId: input.establishmentId, key: input.key, value: changes.name ?? changes.whatsappNumber ?? '' }
  }
}

// Logo novo entra sem o fundo liso, para aparecer bem sobre qualquer cor (login, menu, rodapé, figurinha).
async function withLogoBackgroundRemoved(input: UpsertSettingInput): Promise<UpsertSettingInput> {
  if (input.key !== BRANDING_SETTING_KEYS.logo || typeof input.value !== 'string' || input.value.trim() === '') return input
  return { ...input, value: await removeLogoBackgroundFromDataUrl(input.value) }
}
