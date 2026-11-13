import { eq, count, ilike, or, asc, desc, and, sum, max, min, getTableColumns, type SQL } from 'drizzle-orm'
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
} from '../../domain/repositories/CustomerRepository'
import * as schema from '@/infra/database/schema'
import type { Customer } from '@/infra/database/schema'

function buildCustomerOrderBy(sortBy: CustomerSortField, sortDirection: SortDirection): SQL {
  const direction = sortDirection === 'asc' ? asc : desc
  if (sortBy === 'name') return direction(schema.customers.name)
  if (sortBy === 'orderCount') return direction(count(schema.orders.id))
  if (sortBy === 'totalSpent') return direction(sum(schema.orders.totalAmount))
  return direction(schema.customers.createdAt)
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
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20
    const offset = (page - 1) * pageSize

    const searchCondition = params.search
      ? or(
          ilike(schema.customers.name, `%${params.search}%`),
          ilike(schema.customers.whatsappNumber, `%${params.search}%`)
        )
      : undefined

    const whereClause = and(
      eq(schema.customers.establishmentId, params.establishmentId),
      searchCondition
    )

    const [totalResult, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(schema.customers)
        .where(whereClause),

      this.db
        .select({
          ...getTableColumns(schema.customers),
          orderCount: count(schema.orders.id),
          totalSpent: sum(schema.orders.totalAmount),
          lastOrderAt: max(schema.orders.receivedAt),
        })
        .from(schema.customers)
        .leftJoin(
          schema.orders,
          and(
            eq(schema.orders.customerId, schema.customers.id),
            eq(schema.orders.status, 'completed')
          )
        )
        .where(whereClause)
        .groupBy(schema.customers.id)
        .orderBy(buildCustomerOrderBy(params.sortBy ?? 'createdAt', params.sortDirection ?? 'desc'))
        .limit(pageSize)
        .offset(offset),
    ])

    const total = totalResult[0]?.count ?? 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      data: rows.map((r) => ({
        ...r,
        orderCount: Number(r.orderCount ?? 0),
        totalSpent: r.totalSpent ?? '0',
        lastOrderAt: r.lastOrderAt ? r.lastOrderAt.toISOString() : null,
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
            eq(schema.orders.status, 'completed')
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
