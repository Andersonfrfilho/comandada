import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { deliveryAddressText, singlePaymentMethod } from '@/modules/bot/application/use-cases/GetBotContextUseCase'
import { BRANDING_SETTING_KEYS } from '@/modules/settings/shared/branding.constant'
import type {
  StorefrontCustomer,
  StorefrontEstablishmentRef,
  StorefrontRepository,
  StorefrontTrackedOrder,
} from '../../application/StorefrontService'

type Database = NodePgDatabase<typeof schema>

export class DrizzleStorefrontRepository implements StorefrontRepository {
  constructor(private readonly db: Database) {}

  /** Pelo id da URL; senão pelo domínio cadastrado na marca; senão o primeiro restaurante (como o bot). */
  async findEstablishment(params: { establishmentId?: string | undefined; host?: string | undefined }): Promise<StorefrontEstablishmentRef | null> {
    if (params.establishmentId) {
      const byId = await this.db.query.establishments.findFirst({ where: eq(schema.establishments.id, params.establishmentId) })
      return byId ? { id: byId.id, whatsappNumber: byId.whatsappNumber ?? null } : null
    }
    const host = params.host?.trim().toLowerCase()
    if (host) {
      const rows = await this.db.query.settings.findMany({ where: eq(schema.settings.key, BRANDING_SETTING_KEYS.domains) })
      const match = rows.find(
        (row) => typeof row.value === 'string' && row.value.split(',').some((domain) => domain.trim().toLowerCase() === host)
      )
      if (match) return this.findEstablishment({ establishmentId: match.establishmentId })
    }
    const first = await this.db.query.establishments.findFirst({ orderBy: asc(schema.establishments.createdAt) })
    return first ? { id: first.id, whatsappNumber: first.whatsappNumber ?? null } : null
  }

  async findCustomerByPhones(establishmentId: string, phones: string[]): Promise<StorefrontCustomer | null> {
    if (phones.length === 0) return null
    const rows = await this.db.query.customers.findMany({
      where: and(eq(schema.customers.establishmentId, establishmentId), inArray(schema.customers.whatsappNumber, phones)),
      orderBy: desc(schema.customers.updatedAt),
    })
    // O número como foi digitado ganha do número sem/com o nono dígito.
    const customer = phones.map((phone) => rows.find((row) => row.whatsappNumber === phone)).find(Boolean) ?? null
    return customer ? { id: customer.id, name: customer.name, whatsappNumber: customer.whatsappNumber ?? null } : null
  }

  async lastDeliveryAddress(establishmentId: string, customerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ snapshot: schema.deliveries.addressSnapshot })
      .from(schema.deliveries)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.deliveries.orderId))
      .where(and(eq(schema.orders.customerId, customerId), eq(schema.deliveries.establishmentId, establishmentId)))
      .orderBy(desc(schema.deliveries.createdAt))
      .limit(1)
    return row ? deliveryAddressText(row.snapshot) : null
  }

  async lastPaymentMethod(customerId: string): Promise<string | null> {
    const [order] = await this.db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(eq(schema.orders.customerId, customerId))
      .orderBy(desc(schema.orders.createdAt))
      .limit(1)
    if (!order) return null
    const payments = await this.db
      .select({ method: schema.orderPayments.paymentTypeName })
      .from(schema.orderPayments)
      .where(eq(schema.orderPayments.orderId, order.id))
    return singlePaymentMethod(payments.map((payment) => payment.method))
  }

  async findOrderForTracking(orderId: string): Promise<StorefrontTrackedOrder | null> {
    const order = await this.db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) })
    if (!order) return null
    const [items, charges, payments] = await Promise.all([
      this.db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, orderId) }),
      this.db
        .select()
        .from(schema.paymentCharges)
        .where(eq(schema.paymentCharges.orderId, orderId))
        .orderBy(desc(schema.paymentCharges.createdAt))
        .limit(1),
      this.db
        .select({ method: schema.orderPayments.paymentTypeName })
        .from(schema.orderPayments)
        .where(eq(schema.orderPayments.orderId, orderId)),
    ])
    const charge = charges[0]
    return {
      id: order.id,
      establishmentId: order.establishmentId,
      number: order.number ?? null,
      code: order.code ?? null,
      status: order.status,
      paymentStatus: order.paymentStatus,
      type: order.type,
      totalAmount: Number(order.totalAmount),
      deliveryFee: Number(order.deliveryFee),
      estimatedAt: order.estimatedAt ?? null,
      createdAt: order.createdAt,
      items: items.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        notes: item.notes ?? null,
      })),
      charge: charge
        ? {
            kind: charge.kind,
            status: charge.status,
            pixCopyPaste: charge.pixCopyPaste ?? null,
            paymentUrl: charge.paymentUrl ?? null,
            expiresAt: charge.expiresAt ?? null,
          }
        : null,
      paymentMethods: payments.map((payment) => payment.method),
    }
  }
}
