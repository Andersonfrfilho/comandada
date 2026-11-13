import { eq, and, desc, inArray, gte, lte, or, ilike, sql, count, type SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { OrderStatus, OrderType, OrderChannel } from '@/shared/types'

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
      const searchCondition = or(
        ilike(schema.customers.name, `%${input.search}%`),
        ilike(schema.customers.whatsappNumber, `%${input.search}%`),
        ilike(sql`${schema.orders.id}::text`, `%${input.search}%`)
      )
      if (searchCondition) conditions.push(searchCondition)
    }

    const whereClause = and(...conditions)

    const matchingIdsQuery = this.db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
      .where(whereClause)
      .orderBy(desc(schema.orders.receivedAt))
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
          orderBy: [desc(schema.orders.receivedAt)],
          with: { items: true, customer: true, payments: true },
        })
      : []

    const data = ordersRows.map((order) => ({
      ...order,
      customer: order.customer
        ? { name: order.customer.name, phone: order.customer.whatsappNumber }
        : null,
    }))

    return { data, total: totalRow?.total ?? 0, page, pageSize }
  }
}
