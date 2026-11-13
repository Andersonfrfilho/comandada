import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { Product } from '@/infra/database/schema'
import type { CacheProvider } from '@/shared/providers/CacheProvider'

type Database = NodePgDatabase<typeof schema>

const CACHE_TTL_SECONDS = 60 // 1 minute cache for menu
const CACHE_KEY_PREFIX = 'products:list'

export class ListProductsUseCase {
  constructor(
    private readonly db: Database,
    private readonly cache: CacheProvider
  ) {}

  async execute(establishmentId: string, activeOnly = true): Promise<Product[]> {
    const cacheKey = `${CACHE_KEY_PREFIX}:${establishmentId}:${activeOnly}`
    const cached = await this.cache.get(cacheKey)
    if (cached) {
      return JSON.parse(cached) as Product[]
    }

    const whereClause = activeOnly
      ? and(
          eq(schema.products.establishmentId, establishmentId),
          eq(schema.products.active, true)
        )
      : eq(schema.products.establishmentId, establishmentId)

    const products = await this.db.query.products.findMany({
      where: whereClause,
      orderBy: [schema.products.sortOrder, schema.products.name],
    })

    await this.cache.set(cacheKey, JSON.stringify(products), CACHE_TTL_SECONDS)
    return products
  }

  async invalidateCache(establishmentId: string): Promise<void> {
    await Promise.all([
      this.cache.delete(`${CACHE_KEY_PREFIX}:${establishmentId}:true`),
      this.cache.delete(`${CACHE_KEY_PREFIX}:${establishmentId}:false`),
    ])
  }
}
