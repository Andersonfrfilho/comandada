import { eq, and, asc, desc, inArray, gte, lte, or, ilike, sql, count, type SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { OrderStatus, OrderType, OrderChannel } from '@/shared/types'
import { buildPageResult, containsPattern, type SortDirection } from '@/shared/utils/listQuery'

export const ORDER_SORT_FIELDS = ['receivedAt', 'totalAmount'] as const
export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number]

type Database = NodePgDatabase<typeof schema>

interface ListOrdersInput {
  establishmentId: string
  statuses?: OrderStatus[] | undefined
  types?: OrderType[] | undefined
  channels?: OrderChannel[] | undefined
  search?: string | undefined
  dateFrom?: Date | undefined
  dateTo?: Date | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sortBy?: OrderSortField | undefined
  sortDirection?: SortDirection | undefined
}

export class ListOrdersUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: ListOrdersInput) {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const conditions: SQL[] = [eq(schema.orders.establishmentId, input.establishmentId)]
    if (input.statuses?.length) conditions.push(inArray(schema.orders.status, input.statuses))
    if (input.types?.length) conditions.push(inArray(schema.orders.type, input.types))
    if (input.channels?.length) conditions.push(inArray(schema.orders.channel, input.channels))
    if (input.dateFrom) conditions.push(gte(schema.orders.receivedAt, input.dateFrom))
    if (input.dateTo) conditions.push(lte(schema.orders.receivedAt, input.dateTo))

    // Busca por nome/telefone do cliente ou id do pedido exige join, já que
    // customerId é opcional e o id é UUID (compara como texto).
    if (input.search) {
      const pattern = containsPattern(input.search)
      const searchCondition = or(
        ilike(schema.customers.name, pattern),
        ilike(schema.customers.whatsappNumber, pattern),
        ilike(sql`${schema.orders.id}::text`, pattern)
      )
      if (searchCondition) conditions.push(searchCondition)
    }

    const whereClause = and(...conditions)
    const direction = input.sortDirection === 'asc' ? asc : desc
    const sortColumn = input.sortBy === 'totalAmount' ? schema.orders.totalAmount : schema.orders.receivedAt
    // Desempate pelo id: mesma hora/valor não troca de página entre uma consulta e outra.
    const orderBy = [direction(sortColumn), asc(schema.orders.id)]

    const matchingIdsQuery = this.db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset)

    const totalQuery = this.db
      .select({ total: count() })
      .from(schema.orders)
      .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
      .where(whereClause)

    const [matchingIds, [totalRow]] = await Promise.all([matchingIdsQuery, totalQuery])
    const ids = matchingIds.map((row) => row.id)

    const ordersRows = ids.length
      ? await this.db.query.orders.findMany({
          where: inArray(schema.orders.id, ids),
          with: {
            items: true,
            customer: true,
            payments: true,
            // Só o resumo da nota: a lista mostra o selo sem uma requisição por pedido.
            fiscalDocument: {
              columns: {
                id: true,
                status: true,
                chaveAcesso: true,
                numeroDocumento: true,
                errorCode: true,
                errorMessage: true,
                danfePdfUrl: true,
              },
            },
          },
        })
      : []

    // O IN não guarda a ordem: reaplica a ordem da página.
    const positionById = new Map(ids.map((id, index) => [id, index]))
    const data = ordersRows
      .sort((first, second) => (positionById.get(first.id) ?? 0) - (positionById.get(second.id) ?? 0))
      .map((order) => ({
        ...order,
        customer: order.customer
          ? { name: order.customer.name, phone: order.customer.whatsappNumber }
          : null,
      }))

    return buildPageResult(data, totalRow?.total ?? 0, { page, pageSize, offset })
  }
}
