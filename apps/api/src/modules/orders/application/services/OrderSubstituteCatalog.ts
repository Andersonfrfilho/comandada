import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { rankSubstitutes, type SubstituteCandidate, type SubstituteTarget } from '../../domain/substituteRanking'

type Database = NodePgDatabase<typeof schema>

interface ItemForSubstitution {
  readonly productId: string | null
  readonly productName: string
  readonly unitPrice: string
}

/**
 * Cardápio do restaurante visto pela troca de item em falta: o que pode ser oferecido (produto e
 * categoria ativos) e de que tipo é cada item do pedido.
 */
export class OrderSubstituteCatalog {
  private constructor(
    /** Produtos que podem ser oferecidos ao cliente. */
    readonly offerable: readonly SubstituteCandidate[],
    /** Todos os produtos, inclusive inativos: o item em falta pode ter sido desativado agora. */
    private readonly everyProduct: readonly SubstituteCandidate[]
  ) {}

  static async load(db: Database, establishmentId: string): Promise<OrderSubstituteCatalog> {
    const rows = await db
      .select({
        productId: schema.products.id,
        productName: schema.products.name,
        price: schema.products.price,
        active: schema.products.active,
        catalogId: schema.products.catalogId,
        catalogName: schema.catalogs.name,
        catalogActive: schema.catalogs.active,
        variantGroup: schema.products.variantGroup,
      })
      .from(schema.products)
      .leftJoin(schema.catalogs, eq(schema.catalogs.id, schema.products.catalogId))
      .where(and(eq(schema.products.establishmentId, establishmentId)))

    const toCandidate = (row: (typeof rows)[number]): SubstituteCandidate => ({
      productId: row.productId,
      productName: row.productName,
      unitPrice: Number(row.price),
      catalogId: row.catalogId,
      catalogName: row.catalogName,
      variantGroup: row.variantGroup,
    })
    const offerable = rows.filter((row) => row.active && row.catalogId && row.catalogActive !== false).map(toCandidate)
    return new OrderSubstituteCatalog(offerable, rows.map(toCandidate))
  }

  findOfferable(productId: string): SubstituteCandidate | undefined {
    return this.offerable.find((candidate) => candidate.productId === productId)
  }

  substitutesFor(item: ItemForSubstitution, excludedProductIds: ReadonlySet<string>): SubstituteCandidate[] {
    return rankSubstitutes(this.targetOf(item), this.offerable, excludedProductIds)
  }

  private targetOf(item: ItemForSubstitution): SubstituteTarget {
    const product =
      (item.productId && this.everyProduct.find((candidate) => candidate.productId === item.productId)) ||
      this.everyProduct.find((candidate) => sameName(candidate.productName, item.productName))
    return {
      productId: product?.productId ?? item.productId,
      productName: item.productName,
      unitPrice: Number(item.unitPrice),
      catalogId: product?.catalogId ?? null,
      variantGroup: product?.variantGroup ?? null,
    }
  }
}

function sameName(left: string, right: string): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  return normalize(left) === normalize(right)
}
