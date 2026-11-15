import { describe, expect, it } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { buildFiscalDocumentFilters } from './GetFiscalDocumentUseCase'

const dialect = new PgDialect()
const baseInput = { establishmentId: 'est-1', page: 1, pageSize: 20, offset: 0 }

function render(input: Parameters<typeof buildFiscalDocumentFilters>[0]) {
  const { where, orderBy } = buildFiscalDocumentFilters(input)
  return {
    where: dialect.sqlToQuery(where ?? sql``),
    orderBy: dialect.sqlToQuery(sql.join(orderBy, sql`, `)),
  }
}

describe('buildFiscalDocumentFilters', () => {
  it('sem filtros: só o estabelecimento, mais recentes primeiro', () => {
    const query = render(baseInput)
    expect(query.where.sql).toBe('"fiscal_documents"."establishment_id" = $1')
    expect(query.orderBy.sql).toBe('"fiscal_documents"."created_at" desc, "fiscal_documents"."id" asc')
  })

  it('filtra status, modelo, período e busca por chave, número ou pedido', () => {
    const query = render({
      ...baseInput,
      statuses: ['authorized', 'rejected'],
      models: ['nfce'],
      dateFrom: new Date('2026-11-01T00:00:00Z'),
      dateTo: new Date('2026-11-30T23:59:59Z'),
      search: '1234',
    })
    expect(query.where.sql).toContain('"fiscal_documents"."status" in ($2, $3)')
    expect(query.where.sql).toContain('"fiscal_documents"."model" in ($4)')
    expect(query.where.sql).toContain('"fiscal_documents"."created_at" >=')
    expect(query.where.sql).toContain('"fiscal_documents"."created_at" <=')
    expect(query.where.sql).toContain('"fiscal_documents"."chave_acesso" ilike')
    expect(query.where.sql).toContain('"fiscal_documents"."numero_documento"::text ilike')
    expect(query.where.params).toContain('%1234%')
  })

  it('ordena por valor quando pedido', () => {
    expect(render({ ...baseInput, sortBy: 'totalLiquido', sortDirection: 'asc' }).orderBy.sql).toBe(
      '"fiscal_documents"."total_liquido" asc, "fiscal_documents"."id" asc'
    )
  })
})
