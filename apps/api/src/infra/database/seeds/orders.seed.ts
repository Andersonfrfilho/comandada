import { db } from '../connection'
import * as schema from '../schema'
import { daysAgo, money, randomInt, randomItem, ORDER_RECEIVED_HOURS_AGO } from './helpers/seed-helpers'
import { buildServiceHistory } from './helpers/service-history'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

function orderId(index: number): string {
  return `00000000-0000-0000-0007-${String(index).padStart(12, '0')}`
}

function orderItemId(index: number): string {
  return `00000000-0000-0000-0008-${String(index).padStart(12, '0')}`
}

type OrderStatusValue = 'received' | 'in_production' | 'ready' | 'in_delivery' | 'picked_up' | 'completed' | 'cancelled'

type OrderBlueprint = {
  type: 'delivery' | 'pickup' | 'table'
  channel: 'whatsapp' | 'ifood' | 'manual'
  status: OrderStatusValue
  customerIndex?: number
  tableIndex?: number
  daysAgo: number
}

const BLUEPRINTS: OrderBlueprint[] = [
  { type: 'delivery', channel: 'whatsapp', status: 'completed', customerIndex: 0, daysAgo: 5 },
  { type: 'delivery', channel: 'whatsapp', status: 'completed', customerIndex: 1, daysAgo: 4 },
  { type: 'delivery', channel: 'whatsapp', status: 'in_delivery', customerIndex: 2, daysAgo: 0 },
  { type: 'delivery', channel: 'whatsapp', status: 'cancelled', customerIndex: 3, daysAgo: 2 },
  { type: 'pickup', channel: 'whatsapp', status: 'completed', customerIndex: 4, daysAgo: 3 },
  { type: 'pickup', channel: 'whatsapp', status: 'ready', customerIndex: 5, daysAgo: 0 },
  { type: 'pickup', channel: 'manual', status: 'completed', customerIndex: 6, daysAgo: 6 },
  { type: 'table', channel: 'manual', status: 'completed', customerIndex: 7, tableIndex: 0, daysAgo: 1 },
  { type: 'table', channel: 'manual', status: 'in_production', tableIndex: 2, daysAgo: 0 },
  { type: 'table', channel: 'manual', status: 'received', tableIndex: 8, daysAgo: 0 },
  { type: 'delivery', channel: 'ifood', status: 'completed', customerIndex: 0, daysAgo: 7 },
  { type: 'delivery', channel: 'ifood', status: 'completed', customerIndex: 1, daysAgo: 8 },
  { type: 'pickup', channel: 'whatsapp', status: 'received', customerIndex: 2, daysAgo: 0 },
  { type: 'table', channel: 'manual', status: 'ready', tableIndex: 6, daysAgo: 0 },
  { type: 'delivery', channel: 'whatsapp', status: 'completed', customerIndex: 4, daysAgo: 10 },
  // Pareados com as comandas fechadas do comandas.seed: mesa com comanda
  // contabilizada precisa ter receita, senão o ticket/comanda vira zero.
  { type: 'table', channel: 'manual', status: 'completed', tableIndex: 1, daysAgo: 2 },
  { type: 'table', channel: 'manual', status: 'completed', tableIndex: 3, daysAgo: 3 },
  { type: 'table', channel: 'manual', status: 'completed', tableIndex: 4, daysAgo: 4 },
  { type: 'table', channel: 'manual', status: 'completed', tableIndex: 5, daysAgo: 5 },
  { type: 'table', channel: 'manual', status: 'completed', tableIndex: 9, daysAgo: 6 },
]

// Duração média de cada etapa, em minutos, por tipo de pedido. Sem essa
// variação todas as etapas empatam e a análise de funil não consegue apontar
// gargalo nenhum — a tela fica indemonstrável.
const STAGE_DURATION_MINUTES: Record<OrderBlueprint['type'], {
  toProduction: number
  toReady: number
  toCompleted: number
}> = {
  delivery: { toProduction: 8, toReady: 22, toCompleted: 34 },
  pickup: { toProduction: 5, toReady: 18, toCompleted: 11 },
  table: { toProduction: 4, toReady: 26, toCompleted: 9 },
}

// Desvio determinístico por pedido, para as médias não saírem redondas nem o
// seed variar entre execuções.
function jitterMinutes(index: number, stageOffset: number): number {
  return ((index * 7 + stageOffset * 3) % 9) - 4
}

// Produto sem tempo cadastrado ainda precisa de um realizado plausível — o item
// fica fora da comparação, mas não pode nascer com duração zero.
const DEFAULT_PREPARATION_MINUTES = 10

// Desvio determinístico do realizado em relação ao cadastrado, em minutos.
function itemDeviationMinutes(orderIndex: number, itemOffset: number): number {
  return ((orderIndex * 5 + itemOffset * 11) % 7) - 2
}

type LifecycleParams = {
  status: OrderStatusValue
  type: OrderBlueprint['type']
  baseDaysAgo: number
  index: number
  receivedAtOverride?: Date
}

function buildLifecycleTimestamps({ status, type, baseDaysAgo, index, receivedAtOverride }: LifecycleParams) {
  const inProgress: OrderStatusValue[] = ['in_production', 'ready', 'in_delivery', 'picked_up', 'completed']
  const ready: OrderStatusValue[] = ['ready', 'in_delivery', 'picked_up', 'completed']
  const finished: OrderStatusValue[] = ['picked_up', 'completed']

  const durations = STAGE_DURATION_MINUTES[type]
  const receivedAt = receivedAtOverride ?? daysAgo(baseDaysAgo, ORDER_RECEIVED_HOURS_AGO)

  function stageAt(elapsedMinutes: number, stageOffset: number): Date {
    const jittered = Math.max(1, elapsedMinutes + jitterMinutes(index, stageOffset))
    return new Date(receivedAt.getTime() + jittered * 60 * 1000)
  }

  const productionMinutes = durations.toProduction
  const readyMinutes = productionMinutes + durations.toReady
  const completedMinutes = readyMinutes + durations.toCompleted

  return {
    receivedAt,
    productionStartedAt: inProgress.includes(status) ? stageAt(productionMinutes, 0) : null,
    readyAt: ready.includes(status) ? stageAt(readyMinutes, 1) : null,
    completedAt: finished.includes(status) ? stageAt(completedMinutes, 2) : null,
    cancelledAt: status === 'cancelled' ? stageAt(productionMinutes, 0) : null,
    cancellationReason: status === 'cancelled' ? 'Cliente desistiu do pedido' : null,
  }
}

export type SeededOrder = {
  id: string
  type: OrderBlueprint['type']
  status: OrderStatusValue
  totalAmount: string
  fiscalEnabled: boolean
  daysAgo: number
}

type SeedOrdersParams = {
  establishmentId: string
  customerIds: string[]
  tableIds: string[]
}

export async function seedOrders({ establishmentId, customerIds, tableIds }: SeedOrdersParams): Promise<SeededOrder[]> {
  const products = await db.query.products.findMany({
    where: (product, { eq }) => eq(product.establishmentId, establishmentId),
  })

  if (products.length === 0) {
    console.warn('[Seed] No products found — skipping orders/order_items (run `make db-seed` first).')
    return []
  }

  const orders: SeededOrder[] = []
  const orderRows: (typeof schema.orders.$inferInsert)[] = []
  const orderItems: (typeof schema.orderItems.$inferInsert)[] = []
  const statusLogs: (typeof schema.orderStatusLogs.$inferInsert)[] = []
  let orderItemIndex = 0

  function buildOrder(blueprint: OrderBlueprint, index: number, receivedAtOverride?: Date): SeededOrder {
    const itemCount = randomInt(2, 3)
    let totalAmount = 0
    const itemsOfThisOrder: { rowIndex: number; preparationTimeMinutes: number | null }[] = []

    for (let i = 0; i < itemCount; i += 1) {
      const product = randomItem(products)
      const quantity = randomInt(1, 3)
      const totalPrice = Number(product.price) * quantity
      totalAmount += totalPrice

      orderItems.push({
        id: orderItemId(orderItemIndex),
        orderId: orderId(index),
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity,
        totalPrice: money(totalPrice),
      })
      itemsOfThisOrder.push({
        rowIndex: orderItems.length - 1,
        preparationTimeMinutes: product.preparationTimeMinutes,
      })
      orderItemIndex += 1
    }

    const lifecycle = buildLifecycleTimestamps({
      status: blueprint.status,
      type: blueprint.type,
      baseDaysAgo: blueprint.daysAgo,
      index,
      ...(receivedAtOverride ? { receivedAtOverride } : {}),
    })

    orderRows.push({
      id: orderId(index),
      establishmentId,
      customerId: blueprint.customerIndex !== undefined ? (customerIds[blueprint.customerIndex] ?? null) : null,
      tableId: blueprint.tableIndex !== undefined ? (tableIds[blueprint.tableIndex] ?? null) : null,
      channel: blueprint.channel,
      status: blueprint.status,
      type: blueprint.type,
      totalAmount: money(totalAmount),
      fiscalEnabled: true,
      ...lifecycle,
    })

    // Carimbo por item: o relatório de tempo de preparo compara o cadastrado do
    // produto com o realizado do item. Cada item leva o próprio tempo de
    // cadastro mais um desvio determinístico, senão a comparação sai exata e a
    // tela deixa de demonstrar o que existe para demonstrar.
    if (lifecycle.productionStartedAt) {
      itemsOfThisOrder.forEach((item, itemOffset) => {
        const cadastrado = item.preparationTimeMinutes ?? DEFAULT_PREPARATION_MINUTES
        const realMinutes = Math.max(1, cadastrado + itemDeviationMinutes(index, itemOffset))
        const row = orderItems[item.rowIndex]!
        row.productionStartedAt = lifecycle.productionStartedAt
        row.readyAt = new Date(lifecycle.productionStartedAt!.getTime() + realMinutes * 60 * 1000)
      })
    }

    // O relatório de tempo de preparo mede `ready - in_production` a partir
    // destes logs; sem eles a tela fica em "0 produtos comparados".
    statusLogs.push({ orderId: orderId(index), establishmentId, status: 'received', createdAt: lifecycle.receivedAt })
    if (lifecycle.productionStartedAt) {
      statusLogs.push({
        orderId: orderId(index),
        establishmentId,
        status: 'in_production',
        previousStatus: 'received',
        createdAt: lifecycle.productionStartedAt,
      })
    }
    if (lifecycle.readyAt) {
      statusLogs.push({
        orderId: orderId(index),
        establishmentId,
        status: 'ready',
        previousStatus: 'in_production',
        createdAt: lifecycle.readyAt,
      })
    }
    if (lifecycle.completedAt) {
      statusLogs.push({
        orderId: orderId(index),
        establishmentId,
        status: 'completed',
        previousStatus: 'ready',
        createdAt: lifecycle.completedAt,
      })
    }

    return {
      id: orderId(index),
      type: blueprint.type,
      status: blueprint.status,
      totalAmount: money(totalAmount),
      fiscalEnabled: true,
      daysAgo: blueprint.daysAgo,
    }
  }

  BLUEPRINTS.forEach((blueprint, index) => {
    orders.push(buildOrder(blueprint, index))
  })

  // Movimento histórico do salão, pareado com as comandas fechadas do
  // `comandas.seed` pela mesma lista de sessões. Estes pedidos entram no banco
  // mas ficam fora do retorno de propósito: caixa e fiscal montam seus registros
  // a partir dele, e um turno de caixa não pode carregar trinta dias de venda.
  const serviceHistory = buildServiceHistory(tableIds.length)
  serviceHistory.forEach((session, offset) => {
    const daysAgoValue = Math.floor((Date.now() - session.orderReceivedAt.getTime()) / MILLISECONDS_PER_DAY)
    buildOrder(
      {
        type: 'table',
        channel: 'manual',
        status: 'completed',
        tableIndex: session.tableIndex,
        daysAgo: daysAgoValue,
      },
      BLUEPRINTS.length + offset,
      session.orderReceivedAt
    )
  })

  await db.insert(schema.orders).values(orderRows).onConflictDoNothing()
  await db.insert(schema.orderItems).values(orderItems).onConflictDoNothing()
  await db.insert(schema.orderStatusLogs).values(statusLogs).onConflictDoNothing()

  return orders
}
