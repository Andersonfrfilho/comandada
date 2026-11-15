import { and, asc, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import { orderDisplayCode } from '@/modules/orders/shared/orderNumber'
import type { OrderStatus } from '@/shared/types'

type Database = NodePgDatabase<typeof schema>

export interface ComandaBillItem {
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  notes: string | null
}

export interface ComandaBillOrder {
  id: string
  displayCode: string
  status: OrderStatus
  createdAt: string
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  items: ComandaBillItem[]
}

export interface ComandaBill {
  comanda: {
    id: string
    code: string
    status: 'open' | 'closed' | 'paid'
    customerName: string | null
    openedAt: string
    closedAt: string | null
    tableId: string
    tableNumber: number
  }
  orders: ComandaBillOrder[]
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

/**
 * Conta da comanda: pedidos ligados a ela (cancelados aparecem, mas não somam), o que já entrou no
 * caixa e o que falta receber. Pago online ou com lançamento no caixa conta como pago.
 */
export class GetComandaBillUseCase {
  constructor(private readonly db: Database) {}

  async execute(comandaId: string, establishmentId: string): Promise<ComandaBill> {
    const comanda = await this.db.query.comandas.findFirst({
      where: and(eq(schema.comandas.id, comandaId), eq(schema.comandas.establishmentId, establishmentId)),
    })
    if (!comanda) throw new NotFoundError('Comanda')

    const table = await this.db.query.restaurantTables.findFirst({
      where: eq(schema.restaurantTables.id, comanda.tableId),
      columns: { number: true },
    })

    const orders = await this.db.query.orders.findMany({
      where: and(eq(schema.orders.comandaId, comandaId), eq(schema.orders.establishmentId, establishmentId)),
      orderBy: [asc(schema.orders.createdAt)],
      with: { items: true },
    })

    const orderIds = orders.map((order) => order.id)
    const movements = orderIds.length
      ? await this.db.query.cashMovements.findMany({
          where: and(inArray(schema.cashMovements.orderId, orderIds), eq(schema.cashMovements.type, 'payment')),
          columns: { orderId: true, amount: true },
        })
      : []
    const paidInCash = new Map<string, number>()
    for (const movement of movements) {
      if (!movement.orderId) continue
      paidInCash.set(movement.orderId, (paidInCash.get(movement.orderId) ?? 0) + Number(movement.amount))
    }

    const billOrders: ComandaBillOrder[] = orders.map((order) => {
      const cancelled = order.status === 'cancelled'
      const totalAmount = cancelled ? 0 : Number(order.totalAmount)
      const paidAmount = cancelled
        ? 0
        : order.paymentStatus === 'paid'
          ? totalAmount
          : Math.min(totalAmount, roundMoney(paidInCash.get(order.id) ?? 0))
      return {
        id: order.id,
        displayCode: orderDisplayCode(order),
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        totalAmount,
        paidAmount,
        outstandingAmount: roundMoney(Math.max(0, totalAmount - paidAmount)),
        items: order.items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          notes: item.notes,
        })),
      }
    })

    const totalAmount = roundMoney(billOrders.reduce((sum, order) => sum + order.totalAmount, 0))
    const paidAmount = roundMoney(billOrders.reduce((sum, order) => sum + order.paidAmount, 0))

    return {
      comanda: {
        id: comanda.id,
        code: comanda.code,
        status: comanda.status,
        customerName: comanda.customerName,
        openedAt: comanda.openedAt.toISOString(),
        closedAt: comanda.closedAt ? comanda.closedAt.toISOString() : null,
        tableId: comanda.tableId,
        tableNumber: table?.number ?? 0,
      },
      orders: billOrders,
      totalAmount,
      paidAmount,
      outstandingAmount: roundMoney(Math.max(0, totalAmount - paidAmount)),
    }
  }
}
