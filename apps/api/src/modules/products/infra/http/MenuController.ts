import { eq, and, asc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError } from '@/shared/errors/AppError'
import type { CacheProvider } from '@/shared/providers/CacheProvider'

type Database = NodePgDatabase<typeof schema>

export class MenuController {
  constructor(
    private readonly db: Database,
    private readonly cache: CacheProvider
  ) {}

  getMenu: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const cacheKey = `menu:${establishmentId}`
    const cached = await this.cache.get(cacheKey)
    if (cached) {
      response.json(JSON.parse(cached))
      return
    }

    const [cats, prods] = await Promise.all([
      this.db
        .select()
        .from(schema.catalogs)
        .where(and(eq(schema.catalogs.establishmentId, establishmentId), eq(schema.catalogs.active, true)))
        .orderBy(asc(schema.catalogs.sortOrder), asc(schema.catalogs.name)),
      this.db
        .select()
        .from(schema.products)
        .where(and(eq(schema.products.establishmentId, establishmentId), eq(schema.products.active, true)))
        .orderBy(asc(schema.products.sortOrder), asc(schema.products.name)),
    ])

    const productsByCatalog: Record<string, typeof prods> = {}
    for (const p of prods) {
      const key = p.catalogId ?? '__none__'
      if (!productsByCatalog[key]) productsByCatalog[key] = []
      productsByCatalog[key].push(p)
    }

    const menu = {
      catalogs: cats.map((c) => ({
        id: c.id,
        name: c.name,
        products: productsByCatalog[c.id] ?? [],
      })),
      withoutCatalog: productsByCatalog['__none__'] ?? [],
    }

    await this.cache.set(cacheKey, JSON.stringify(menu), 60)
    response.json(menu)
  }
}
