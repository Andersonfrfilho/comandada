import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { ValidationError } from '@/shared/errors/AppError'
import { toSlug } from '@/shared/utils/toSlug'

type Database = NodePgDatabase<typeof schema>

export interface ImportMenuCatalogParams {
  readonly name: string
  readonly sortOrder: number
  readonly active: boolean
}

export interface ImportMenuProductParams {
  readonly catalogName: string
  readonly name: string
  readonly description?: string | undefined
  readonly price: number
  readonly active: boolean
  readonly sortOrder: number
  readonly variantGroup?: string | undefined
  readonly variantLabel?: string | undefined
}

export interface ImportMenuParams {
  readonly establishmentId: string
  readonly catalogs: readonly ImportMenuCatalogParams[]
  readonly products: readonly ImportMenuProductParams[]
}

export interface ImportMenuResult {
  readonly catalogsCreated: number
  readonly productsCreated: number
  readonly productsUpdated: number
}

// Idempotent by slug: running it again updates price, description and order instead of duplicating.
export class ImportMenuUseCase {
  constructor(private readonly db: Database) {}

  async execute(params: ImportMenuParams): Promise<ImportMenuResult> {
    const { catalogIdByName, created: catalogsCreated } = await this.upsertCatalogs(params)
    let productsCreated = 0
    let productsUpdated = 0

    for (const product of params.products) {
      const catalogId = catalogIdByName.get(product.catalogName)
      if (!catalogId) throw new ValidationError('Unknown catalog', { catalogName: [product.catalogName] })
      const wasCreated = await this.upsertProduct({ establishmentId: params.establishmentId, catalogId, product })
      if (wasCreated) productsCreated += 1
      else productsUpdated += 1
    }

    return { catalogsCreated, productsCreated, productsUpdated }
  }

  private async upsertCatalogs(params: ImportMenuParams) {
    const catalogIdByName = new Map<string, string>()
    let created = 0
    for (const catalog of params.catalogs) {
      const slug = toSlug(catalog.name)
      const existing = await this.db.query.catalogs.findFirst({
        where: and(eq(schema.catalogs.establishmentId, params.establishmentId), eq(schema.catalogs.slug, slug)),
        columns: { id: true },
      })
      if (existing) {
        await this.db
          .update(schema.catalogs)
          .set({ name: catalog.name, sortOrder: catalog.sortOrder, active: catalog.active })
          .where(eq(schema.catalogs.id, existing.id))
        catalogIdByName.set(catalog.name, existing.id)
        continue
      }
      const [inserted] = await this.db
        .insert(schema.catalogs)
        .values({ establishmentId: params.establishmentId, name: catalog.name, slug, sortOrder: catalog.sortOrder, active: catalog.active })
        .returning({ id: schema.catalogs.id })
      if (!inserted) throw new ValidationError('Catalog not created', { catalogName: [catalog.name] })
      catalogIdByName.set(catalog.name, inserted.id)
      created += 1
    }
    return { catalogIdByName, created }
  }

  private async upsertProduct(input: {
    establishmentId: string
    catalogId: string
    product: ImportMenuProductParams
  }): Promise<boolean> {
    const { product } = input
    const slug = toSlug(product.name)
    const values = {
      catalogId: input.catalogId,
      name: product.name,
      description: product.description ?? null,
      price: product.price.toFixed(2),
      active: product.active,
      sortOrder: product.sortOrder,
      variantGroup: product.variantGroup ?? null,
      variantLabel: product.variantLabel ?? null,
    }
    const existing = await this.db.query.products.findFirst({
      where: and(eq(schema.products.establishmentId, input.establishmentId), eq(schema.products.slug, slug)),
      columns: { id: true },
    })
    if (existing) {
      await this.db
        .update(schema.products)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(schema.products.id, existing.id))
      return false
    }
    await this.db.insert(schema.products).values({ ...values, establishmentId: input.establishmentId, slug })
    return true
  }
}
