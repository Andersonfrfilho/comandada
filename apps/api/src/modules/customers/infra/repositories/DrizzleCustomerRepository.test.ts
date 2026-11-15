import { describe, expect, it } from 'bun:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '@/infra/database/schema'
import { buildCustomerListQueries } from './DrizzleCustomerRepository'

// O Pool não conecta até a primeira query: aqui só montamos o SQL.
const db = drizzle(new Pool(), { schema })
const establishmentId = '00000000-0000-0000-0000-000000000001'
const now = new Date('2026-11-15T12:00:00Z')

function render(params: Parameters<typeof buildCustomerListQueries>[1]) {
  const { rowsQuery } = buildCustomerListQueries(db, params, now)
  return rowsQuery.toSQL()
}

describe('buildCustomerListQueries', () => {
  it('pagina com limit/offset e ordena por cadastro mais recente por padrão', () => {
    const query = render({ establishmentId, page: 3, pageSize: 25 })
    expect(query.sql).toContain('order by "customers"."created_at" desc')
    expect(query.sql).toContain('limit $')
    expect(query.params).toContain(25)
    expect(query.params).toContain(50)
  })

  it('escapa curingas da busca e procura também por documento e dígitos do telefone', () => {
    const query = render({ establishmentId, search: '(11) 98888-7777' })
    expect(query.sql).toContain('"customers"."document" ilike')
    expect(query.params).toContain('%(11) 98888-7777%')
    expect(query.params).toContain('%11988887777%')

    const literal = render({ establishmentId, search: '100%' })
    expect(literal.params).toContain('%100\\%%')
  })

  it('segmentos de pedidos vão no HAVING', () => {
    expect(render({ establishmentId, segment: 'without_orders' }).sql).toContain('having count("orders"."id") = 0')
    expect(render({ establishmentId, segment: 'with_orders' }).sql).toContain('having count("orders"."id") > 0')

    const inactive = render({ establishmentId, segment: 'inactive' })
    expect(inactive.sql).toContain('max("orders"."received_at") <')
    expect(inactive.params).toContain('2026-10-16T12:00:00.000Z')
  })

  it('aniversariantes do mês e avaliação mínima filtram no WHERE', () => {
    const query = render({ establishmentId, segment: 'birthday_month', minRating: 4 })
    expect(query.sql).toContain('extract(month from "customers"."birth_date") =')
    expect(query.params).toContain(11)
    expect(query.sql).toContain('"customers"."rating" >=')
    expect(query.sql).not.toContain('having')
  })

  it('ordena por último pedido deixando quem nunca pediu no fim', () => {
    expect(render({ establishmentId, sortBy: 'lastOrderAt', sortDirection: 'asc' }).sql).toContain(
      'max("orders"."received_at") asc nulls last'
    )
    expect(render({ establishmentId, sortBy: 'averageTicket', sortDirection: 'desc' }).sql).toContain(
      'nullif(count("orders"."id"), 0), 2), 0) desc'
    )
  })
})
