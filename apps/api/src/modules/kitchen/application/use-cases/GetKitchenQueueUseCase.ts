import { eq, and, inArray, notInArray, asc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { PAYMENT_STATUSES_HELD_FROM_KITCHEN } from '@/modules/payments/shared/payments.constant'

type Database = NodePgDatabase<typeof schema>

const KITCHEN_STATUSES = ['received', 'in_production'] as const

// SLA thresholds in minutes
const SLA_WARNING_MINUTES = 15
const SLA_CRITICAL_MINUTES = 25

// Encomenda só aparece para a cozinha perto da hora marcada: preparo (e entrega) antes do horário.
export const SCHEDULED_ORDER_LEAD_MINUTES = { pickup: 40, delivery: 60 } as const

function releaseTime(order: { scheduledFor: Date | null; type: string; receivedAt: Date }): number {
  const received = new Date(order.receivedAt).getTime()
  if (!order.scheduledFor) return received
  const lead = order.type === 'delivery' ? SCHEDULED_ORDER_LEAD_MINUTES.delivery : SCHEDULED_ORDER_LEAD_MINUTES.pickup
  return Math.max(received, new Date(order.scheduledFor).getTime() - lead * 60000)
}

export class GetKitchenQueueUseCase {
  constructor(private readonly db: Database) {}

  async execute(establishmentId: string) {
    const orders = await this.db.query.orders.findMany({
      where: and(
        eq(schema.orders.establishmentId, establishmentId),
        inArray(schema.orders.status, [...KITCHEN_STATUSES]),
        // Pedido esperando o Pix/cartão online só entra na fila depois de pago.
        notInArray(schema.orders.paymentStatus, [...PAYMENT_STATUSES_HELD_FROM_KITCHEN])
      ),
      orderBy: [asc(schema.orders.receivedAt)],
      with: { items: true },
    })

    const now = Date.now()

    // Encomenda de mais tarde fica fora até a hora de começar; já iniciada, continua na fila.
    const due = orders
      .filter((order) => order.status === 'in_production' || releaseTime(order) <= now)
      .sort((first, second) => releaseTime(first) - releaseTime(second))

    return due.map((order) => {
      // O relógio do SLA começa quando a encomenda entra na fila, não quando foi feita.
      const ageMinutes = Math.max(0, Math.floor((now - releaseTime(order)) / 60000))
      const slaStatus =
        ageMinutes >= SLA_CRITICAL_MINUTES
          ? 'critical'
          : ageMinutes >= SLA_WARNING_MINUTES
            ? 'warning'
            : 'ok'

      return { ...order, ageMinutes, slaStatus }
    })
  }
}
