import { eq, ne, count, ilike, or, asc, desc, and, sum, max, min, gte, sql, getTableColumns, type SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type {
  CustomerRepository,
  CustomerWithStats,
  CustomerDetails,
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersByEstablishmentParams,
  CustomerSortField,
  SortDirection,
  CustomerSegment,
} from '../../domain/repositories/CustomerRepository'
import { CUSTOMER_INACTIVE_DAYS } from '../../domain/repositories/CustomerRepository'
import { containsPattern } from '@/shared/utils/listQuery'
import * as schema from '@/infra/database/schema'
import type { Customer } from '@/infra/database/schema'

const orderCountExpression = count(schema.orders.id)
const totalSpentExpression = sql<string>`coalesce(sum(${schema.orders.totalAmount}), 0)`
const averageTicketExpression = sql<string>`coalesce(round(sum(${schema.orders.totalAmount}) / nullif(count(${schema.orders.id}), 0), 2), 0)`
const lastOrderAtExpression = max(schema.orders.receivedAt)

function buildCustomerOrderBy(sortBy: CustomerSortField, sortDirection: SortDirection): SQL[] {
  const direction = sortDirection === 'asc' ? asc : desc
  // Desempate pelo id: com a mesma contagem/valor, a ordem entre páginas fica estável.
  const tieBreaker = asc(schema.customers.id)
  if (sortBy === 'name') return [direction(schema.customers.name), tieBreaker]
  if (sortBy === 'orderCount') return [direction(orderCountExpression), tieBreaker]
  if (sortBy === 'totalSpent') return [direction(totalSpentExpression), tieBreaker]
  if (sortBy === 'averageTicket') return [direction(averageTicketExpression), tieBreaker]
  if (sortBy === 'lastOrderAt') {
    // Quem nunca pediu fica no fim nos dois sentidos.
    return [sql`${lastOrderAtExpression} ${sql.raw(sortDirection === 'asc' ? 'asc' : 'desc')} nulls last`, tieBreaker]
  }
  return [direction(schema.customers.createdAt), tieBreaker]
}

// Filtros que dependem dos pedidos (contagem, último pedido) só existem depois do GROUP BY: vão no HAVING.
function buildSegmentHaving(segment: CustomerSegment | undefined, now: Date): SQL | undefined {
  if (segment === 'with_orders') return sql`${orderCountExpression} > 0`
  if (segment === 'without_orders') return sql`${orderCountExpression} = 0`
  if (segment === 'inactive') {
    const cutoff = new Date(now.getTime() - CUSTOMER_INACTIVE_DAYS * 24 * 60 * 60 * 1000)
    return sql`${orderCountExpression} > 0 and ${lastOrderAtExpression} < ${cutoff.toISOString()}`
  }
  return undefined
}

export function buildCustomerListQueries(
  db: NodePgDatabase<typeof schema>,
  params: ListCustomersByEstablishmentParams,
  now: Date = new Date()
) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const searchPattern = params.search ? containsPattern(params.search) : undefined
  const searchDigits = params.search?.replace(/\D/g, '') ?? ''
  const searchCondition = searchPattern
    ? or(
        ilike(schema.customers.name, searchPattern),
        ilike(schema.customers.whatsappNumber, searchPattern),
        ilike(schema.customers.document, searchPattern),
        // "(11) 98888-7777" acha o número salvo só com dígitos.
        searchDigits.length >= 4 ? ilike(schema.customers.whatsappNumber, `%${searchDigits}%`) : undefined
      )
    : undefined

  const whereClause = and(
    eq(schema.customers.establishmentId, params.establishmentId),
    searchCondition,
    params.minRating ? gte(schema.customers.rating, params.minRating) : undefined,
    params.segment === 'birthday_month'
      ? sql`extract(month from ${schema.customers.birthDate}) = ${now.getMonth() + 1}`
      : undefined
  )
  const havingClause = buildSegmentHaving(params.segment, now)

  const groupedQuery = db
    .select({
      ...getTableColumns(schema.customers),
      orderCount: orderCountExpression,
      totalSpent: totalSpentExpression,
      averageTicket: averageTicketExpression,
      lastOrderAt: lastOrderAtExpression,
    })
    .from(schema.customers)
    .leftJoin(
      schema.orders,
      and(
        eq(schema.orders.customerId, schema.customers.id),
        // Pedido aberto também conta: só o concluído deixava quem acabou de pedir com 0 / R$ 0,00
        // até a entrega. Cancelado não é compra.
        ne(schema.orders.status, 'cancelled')
      )
    )
    .where(whereClause)
    .groupBy(schema.customers.id)
    .having(havingClause)

  const rowsQuery = groupedQuery
    .orderBy(...buildCustomerOrderBy(params.sortBy ?? 'createdAt', params.sortDirection ?? 'desc'))
    .limit(pageSize)
    .offset(offset)

  return { page, pageSize, groupedQuery, rowsQuery }
}

export class DrizzleCustomerRepository implements CustomerRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async listByEstablishment(params: ListCustomersByEstablishmentParams): Promise<{
    data: CustomerWithStats[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }> {
    const { page, pageSize, groupedQuery, rowsQuery } = buildCustomerListQueries(this.db, params)

    // O total conta sobre o resultado agrupado, para respeitar os filtros do HAVING.
    const [totalResult, rows] = await Promise.all([
      this.db.select({ count: count() }).from(groupedQuery.as('filtered_customers')),
      rowsQuery,
    ])

    const total = totalResult[0]?.count ?? 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      data: rows.map((row) => ({
        ...row,
        orderCount: Number(row.orderCount ?? 0),
        totalSpent: String(row.totalSpent ?? '0'),
        averageTicket: String(row.averageTicket ?? '0'),
        lastOrderAt: row.lastOrderAt ? new Date(row.lastOrderAt).toISOString() : null,
      })),
      total,
      page,
      pageSize,
      totalPages,
    }
  }

  async findById(id: string, establishmentId: string): Promise<Customer | null> {
    const [customer] = await this.db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.id, id), eq(schema.customers.establishmentId, establishmentId)))
    return customer ?? null
  }

  async findByWhatsApp(whatsappNumber: string, establishmentId: string): Promise<Customer | null> {
    const [customer] = await this.db
      .select()
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.whatsappNumber, whatsappNumber),
          eq(schema.customers.establishmentId, establishmentId)
        )
      )
    return customer ?? null
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    const [customer] = await this.db
      .insert(schema.customers)
      .values({
        establishmentId: input.establishmentId,
        name: input.name,
        whatsappNumber: input.whatsappNumber,
        phone: input.phone ?? null,
        document: input.document ?? null,
        birthDate: input.birthDate ?? null,
        rating: input.rating ?? null,
      })
      .returning()
    return customer!
  }

  async update(id: string, establishmentId: string, input: UpdateCustomerInput): Promise<Customer> {
    const [customer] = await this.db
      .update(schema.customers)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.whatsappNumber !== undefined && { whatsappNumber: input.whatsappNumber }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.document !== undefined && { document: input.document }),
        ...(input.birthDate !== undefined && { birthDate: input.birthDate }),
        ...(input.rating !== undefined && { rating: input.rating }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.customers.id, id), eq(schema.customers.establishmentId, establishmentId)))
      .returning()
    return customer!
  }

  async delete(id: string, establishmentId: string): Promise<void> {
    await this.db
      .delete(schema.customers)
      .where(and(eq(schema.customers.id, id), eq(schema.customers.establishmentId, establishmentId)))
  }

  async getDetails(id: string, establishmentId: string): Promise<CustomerDetails | null> {
    const customer = await this.findById(id, establishmentId)
    if (!customer) return null

    const [statsResult, recentOrders] = await Promise.all([
      this.db
        .select({
          orderCount: count(schema.orders.id),
          totalSpent: sum(schema.orders.totalAmount),
          lastOrderAt: max(schema.orders.receivedAt),
          firstOrderAt: min(schema.orders.receivedAt),
        })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.customerId, id),
            ne(schema.orders.status, 'cancelled')
          )
        ),

      this.db
        .select({
          id: schema.orders.id,
          status: schema.orders.status,
          totalAmount: schema.orders.totalAmount,
          channel: schema.orders.channel,
          type: schema.orders.type,
          receivedAt: schema.orders.receivedAt,
        })
        .from(schema.orders)
        .where(eq(schema.orders.customerId, id))
        .orderBy(desc(schema.orders.receivedAt))
        .limit(10),
    ])

    const s = statsResult[0]!
    return {
      customer,
      stats: {
        orderCount: Number(s.orderCount ?? 0),
        totalSpent: s.totalSpent ?? '0',
        lastOrderAt: s.lastOrderAt ? s.lastOrderAt.toISOString() : null,
        firstOrderAt: s.firstOrderAt ? s.firstOrderAt.toISOString() : null,
      },
      recentOrders,
    }
  }
}
