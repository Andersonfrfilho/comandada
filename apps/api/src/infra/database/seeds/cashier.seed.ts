import { db } from '../connection'
import * as schema from '../schema'
import { daysAgo, money, randomItem } from './helpers/seed-helpers'
import type { SeededOrder } from './orders.seed'

const CASH_REGISTER_IDS = {
  closed: '00000000-0000-0000-000a-000000000001',
  open: '00000000-0000-0000-000a-000000000002',
} as const

function cashMovementId(index: number): string {
  return `00000000-0000-0000-000b-${String(index).padStart(12, '0')}`
}

const PAYMENT_METHODS = ['pix', 'card_credit', 'card_debit', 'cash'] as const

type SeedCashierParams = {
  establishmentId: string
  caixaUserId: string
  orders: SeededOrder[]
}

export async function seedCashier({ establishmentId, caixaUserId, orders }: SeedCashierParams): Promise<void> {
  const registers = [
    {
      id: CASH_REGISTER_IDS.closed,
      establishmentId,
      userId: caixaUserId,
      status: 'closed' as const,
      openingAmount: money(100),
      closingAmount: money(320.5),
      openedAt: daysAgo(2, 10),
      closedAt: daysAgo(2, 1),
    },
    {
      id: CASH_REGISTER_IDS.open,
      establishmentId,
      userId: caixaUserId,
      status: 'open' as const,
      openingAmount: money(150),
      openedAt: daysAgo(0, 8),
    },
  ]
  await db.insert(schema.cashRegisters).values(registers).onConflictDoNothing()

  const completedOrders = orders.filter((order) => order.status === 'completed')
  const movements: (typeof schema.cashMovements.$inferInsert)[] = completedOrders.map((order, index) => ({
    id: cashMovementId(index),
    cashRegisterId: order.daysAgo >= 2 ? CASH_REGISTER_IDS.closed : CASH_REGISTER_IDS.open,
    orderId: order.id,
    type: 'payment' as const,
    paymentMethod: randomItem(PAYMENT_METHODS),
    amount: order.totalAmount,
    createdAt: daysAgo(order.daysAgo, 0),
  }))

  movements.push(
    {
      id: cashMovementId(completedOrders.length),
      cashRegisterId: CASH_REGISTER_IDS.open,
      type: 'supply',
      amount: money(50),
      notes: 'Reforço de troco',
      createdAt: daysAgo(0, 6),
    },
    {
      id: cashMovementId(completedOrders.length + 1),
      cashRegisterId: CASH_REGISTER_IDS.open,
      type: 'withdrawal',
      amount: money(30),
      notes: 'Sangria para pagamento de fornecedor',
      createdAt: daysAgo(0, 2),
    }
  )

  await db.insert(schema.cashMovements).values(movements).onConflictDoNothing()
}
