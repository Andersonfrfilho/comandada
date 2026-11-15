import { describe, expect, it } from 'bun:test'
import { drizzle } from 'drizzle-orm/node-postgres'

import { DrizzleConversationHistoryReader } from './ConversationHistoryReader'

interface CapturedQuery {
  sql: string
  params: unknown[]
}

/**
 * Banco de mentira que monta o SQL de verdade (drizzle sem conexão) e devolve linhas prontas: o que
 * importa aqui é a ordem e o corte que vão para o Postgres.
 */
function buildDatabase(results: unknown[][]) {
  const builderDatabase = drizzle.mock()
  const queries: CapturedQuery[] = []

  function wrap<T extends object>(builder: T): T {
    return new Proxy(builder, {
      get(target, property) {
        if (property === 'then') {
          queries.push((target as unknown as { toSQL(): CapturedQuery }).toSQL())
          const rows = results.shift() ?? []
          return (resolve: (value: unknown) => void) => resolve(rows)
        }
        const value = Reflect.get(target, property)
        return typeof value === 'function'
          ? (...args: unknown[]) => wrap((value as (...inner: unknown[]) => object).apply(target, args))
          : value
      },
    })
  }

  const database = {
    select: (fields?: Record<string, unknown>) =>
      wrap(fields ? builderDatabase.select(fields as never) : builderDatabase.select()),
  }
  return { database, queries }
}

const PAGE = { companyId: 'e1', whatsappNumber: '5516993056772', limit: 51 }

describe('DrizzleConversationHistoryReader', () => {
  it('pede as mensagens da mais nova para a mais antiga antes de cortar a página', async () => {
    const newest = { id: 'm3', content: 'Pedido confirmado' }
    const { database, queries } = buildDatabase([[{ id: 's1' }], [newest]])

    const rows = await new DrizzleConversationHistoryReader(database as never).recentMessages(PAGE)

    expect(rows).toEqual([newest] as never)
    const history = queries[1]!
    expect(history.sql).toMatch(/order by "meta_whatsapp"\."messages"\."created_at" desc limit \$\d+$/)
    expect(history.params).toEqual(['e1', 's1', 51])
  })

  it('com "before" busca só o que veio antes, para a rolagem carregar o passado', async () => {
    const { database, queries } = buildDatabase([[{ id: 's1' }], []])

    await new DrizzleConversationHistoryReader(database as never).recentMessages({
      ...PAGE,
      before: '2026-11-15T00:39:30.000Z',
    })

    const history = queries[1]!
    expect(history.sql).toContain('"meta_whatsapp"."messages"."created_at" < $3')
    expect(history.params[2]).toBe('2026-11-15T00:39:30.000Z')
  })

  it('ignora "before" inválido em vez de quebrar a consulta', async () => {
    const { database, queries } = buildDatabase([[{ id: 's1' }], []])

    await new DrizzleConversationHistoryReader(database as never).recentMessages({ ...PAGE, before: 'ontem' })

    expect(queries[1]!.sql).not.toContain('<')
  })

  it('conversa inexistente devolve undefined sem consultar mensagens', async () => {
    const { database, queries } = buildDatabase([[]])

    const rows = await new DrizzleConversationHistoryReader(database as never).recentMessages(PAGE)

    expect(rows).toBeUndefined()
    expect(queries).toHaveLength(1)
  })
})
