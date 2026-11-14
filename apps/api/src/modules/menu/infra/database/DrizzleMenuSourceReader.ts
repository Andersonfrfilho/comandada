import { and, asc, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { BRANDING_SETTING_KEYS } from '@/modules/settings/shared/branding.constant'
import type { MenuSource, MenuSourceReader } from '../../application/services/MenuPdfService'

type Database = NodePgDatabase<typeof schema>

const MENU_SETTING_KEYS = {
  address: 'establishment_address',
  city: 'establishment_city',
  instagram: 'establishment_instagram',
} as const

/** Cardápio do PDF: os mesmos produtos que o bot oferece (ativos, de categoria ativa, na mesma ordem). */
export class DrizzleMenuSourceReader implements MenuSourceReader {
  constructor(private readonly db: Database) {}

  async forEstablishment(establishmentId: string): Promise<MenuSource | null> {
    const establishment = await this.db.query.establishments.findFirst({
      where: eq(schema.establishments.id, establishmentId),
    })
    if (!establishment) return null

    const [settingRows, productRows] = await Promise.all([
      this.db.query.settings.findMany({
        where: and(
          eq(schema.settings.establishmentId, establishmentId),
          inArray(schema.settings.key, [
            BRANDING_SETTING_KEYS.name,
            BRANDING_SETTING_KEYS.logo,
            BRANDING_SETTING_KEYS.primaryColor,
            MENU_SETTING_KEYS.address,
            MENU_SETTING_KEYS.city,
            MENU_SETTING_KEYS.instagram,
          ])
        ),
      }),
      this.db
        .select({
          name: schema.products.name,
          price: schema.products.price,
          description: schema.products.description,
          category: schema.catalogs.name,
          variantGroup: schema.products.variantGroup,
          variantLabel: schema.products.variantLabel,
        })
        .from(schema.products)
        .innerJoin(schema.catalogs, eq(schema.catalogs.id, schema.products.catalogId))
        .where(
          and(
            eq(schema.products.establishmentId, establishmentId),
            eq(schema.products.active, true),
            eq(schema.catalogs.active, true)
          )
        )
        .orderBy(asc(schema.catalogs.sortOrder), asc(schema.products.sortOrder), asc(schema.products.name)),
    ])

    const valueOf = (key: string): string | null => {
      const value = settingRows.find((row) => row.key === key)?.value
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
    }

    return {
      name: valueOf(BRANDING_SETTING_KEYS.name) ?? establishment.name,
      whatsappNumber: establishment.whatsappNumber ?? null,
      logo: valueOf(BRANDING_SETTING_KEYS.logo),
      primaryColor: valueOf(BRANDING_SETTING_KEYS.primaryColor),
      address: valueOf(MENU_SETTING_KEYS.address),
      city: valueOf(MENU_SETTING_KEYS.city),
      instagram: valueOf(MENU_SETTING_KEYS.instagram),
      products: productRows.map((row) => ({ ...row, price: Number(row.price) })),
    }
  }
}
