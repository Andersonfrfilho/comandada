import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { BRANDING_SETTING_KEYS } from '../../shared/branding.constant'

type Database = NodePgDatabase<typeof schema>

export interface Branding {
  name: string
  logo: string | null
  primaryColor: string | null
}

// A marca de cada restaurante vem das configurações dele, nunca do código: nome, logo e cor
// principal. Sem domínio cadastrado, o painel cai na marca padrão do ComandAdA.
export class GetBrandingUseCase {
  constructor(private readonly db: Database) {}

  async forEstablishment(establishmentId: string): Promise<Branding | null> {
    const establishment = await this.db.query.establishments.findFirst({
      where: eq(schema.establishments.id, establishmentId),
    })
    if (!establishment) return null
    const rows = await this.db.query.settings.findMany({
      where: and(
        eq(schema.settings.establishmentId, establishmentId),
        inArray(schema.settings.key, [
          BRANDING_SETTING_KEYS.name,
          BRANDING_SETTING_KEYS.logo,
          BRANDING_SETTING_KEYS.primaryColor,
        ])
      ),
    })
    const valueOf = (key: string): string | null => {
      const value = rows.find((row) => row.key === key)?.value
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
    }
    return {
      name: valueOf(BRANDING_SETTING_KEYS.name) ?? establishment.name,
      logo: valueOf(BRANDING_SETTING_KEYS.logo),
      primaryColor: valueOf(BRANDING_SETTING_KEYS.primaryColor),
    }
  }

  async forHost(host: string): Promise<Branding | null> {
    const normalizedHost = host.trim().toLowerCase()
    if (!normalizedHost) return null
    const rows = await this.db.query.settings.findMany({
      where: eq(schema.settings.key, BRANDING_SETTING_KEYS.domains),
    })
    const match = rows.find((row) => {
      if (typeof row.value !== 'string') return false
      return row.value
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .includes(normalizedHost)
    })
    return match ? this.forEstablishment(match.establishmentId) : null
  }
}
