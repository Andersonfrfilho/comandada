import { eq, and, asc, desc, gte, lte, ilike, inArray, or, sql, count, type SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import {
  buildPageResult,
  containsPattern,
  type PageRequest,
  type PageResult,
  type SortDirection,
} from '@/shared/utils/listQuery'

export const FISCAL_DOCUMENT_SORT_FIELDS = ['createdAt', 'totalLiquido', 'numeroDocumento'] as const
export type FiscalDocumentSortField = (typeof FISCAL_DOCUMENT_SORT_FIELDS)[number]

export interface ListFiscalDocumentsInput extends PageRequest {
  establishmentId: string
  statuses?: Array<schema.FiscalDocument['status']>
  models?: Array<schema.FiscalDocument['model']>
  search?: string | undefined
  dateFrom?: Date | undefined
  dateTo?: Date | undefined
  sortBy?: FiscalDocumentSortField | undefined
  sortDirection?: SortDirection | undefined
}

export function buildFiscalDocumentFilters(input: ListFiscalDocumentsInput): { where: SQL | undefined; orderBy: SQL[] } {
  const table = schema.fiscalDocuments
  const pattern = input.search ? containsPattern(input.search) : undefined
  const where = and(
    eq(table.establishmentId, input.establishmentId),
    input.statuses?.length ? inArray(table.status, input.statuses) : undefined,
    input.models?.length ? inArray(table.model, input.models) : undefined,
    input.dateFrom ? gte(table.createdAt, input.dateFrom) : undefined,
    input.dateTo ? lte(table.createdAt, input.dateTo) : undefined,
    pattern
      ? or(
          ilike(table.chaveAcesso, pattern),
          ilike(sql`${table.numeroDocumento}::text`, pattern),
          ilike(sql`${table.orderId}::text`, pattern)
        )
      : undefined
  )
  const direction = input.sortDirection === 'asc' ? asc : desc
  const sortColumn =
    input.sortBy === 'totalLiquido'
      ? table.totalLiquido
      : input.sortBy === 'numeroDocumento'
        ? table.numeroDocumento
        : table.createdAt
  return { where, orderBy: [direction(sortColumn), asc(table.id)] }
}

type Database = NodePgDatabase<typeof schema>

export class GetFiscalDocumentUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: { orderId: string; establishmentId: string }) {
    const doc = await this.db.query.fiscalDocuments.findFirst({
      where: and(
        eq(schema.fiscalDocuments.orderId, input.orderId),
        eq(schema.fiscalDocuments.establishmentId, input.establishmentId)
      ),
    })
    if (!doc) throw new NotFoundError('Fiscal document')

    return doc
  }

  async findById(id: string, establishmentId: string) {
    const doc = await this.db.query.fiscalDocuments.findFirst({
      where: and(
        eq(schema.fiscalDocuments.id, id),
        eq(schema.fiscalDocuments.establishmentId, establishmentId)
      ),
    })
    if (!doc) throw new NotFoundError('Fiscal document')

    return doc
  }

  // Unscoped lookup for public (token-authorized) access — no establishment filter.
  async findByIdPublic(id: string) {
    return this.db.query.fiscalDocuments.findFirst({
      where: eq(schema.fiscalDocuments.id, id),
    })
  }

  // Emitter's public name (razão social) for the customer-facing receipt.
  async findEstablishmentName(establishmentId: string): Promise<string | null> {
    const config = await this.db.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
      columns: { razaoSocial: true },
    })
    return config?.razaoSocial ?? null
  }

  async listByEstablishment(input: ListFiscalDocumentsInput): Promise<PageResult<schema.FiscalDocument>> {
    const { where, orderBy } = buildFiscalDocumentFilters(input)
    const [rows, [totalRow]] = await Promise.all([
      this.db.query.fiscalDocuments.findMany({
        where,
        orderBy,
        limit: input.pageSize,
        offset: input.offset,
      }),
      this.db.select({ total: count() }).from(schema.fiscalDocuments).where(where),
    ])
    return buildPageResult(rows, totalRow?.total ?? 0, input)
  }
}
