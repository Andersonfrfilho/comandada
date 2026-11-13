import { eq, and, gte, sql, isNotNull } from 'drizzle-orm'
import { db } from '../connection'
import * as schema from '../schema'
import { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { CreateStockBatchUseCase } from '@/modules/products/application/use-cases/CreateStockBatchUseCase'
import { DeductStockForOrderUseCase } from '@/modules/products/application/use-cases/DeductStockForOrderUseCase'

/**
 * Baixa de estoque dos pedidos recentes, para o ranking de ingredientes ter o
 * que mostrar. A janela é curta de propósito: consumo é lastreado em lote, e
 * reproduzir trinta dias de salão exigiria trinta dias de reposição — o seed
 * compraria um caminhão de arroz para popular uma tela.
 */
const CONSUMPTION_WINDOW_DAYS = 3

// Folga sobre o consumo da janela, para o estoque não terminar zerado e a tela
// de estoque baixo não acusar ruptura em todos os ingredientes.
const REPLENISHMENT_SAFETY_FACTOR = 1.6

const REPLENISHMENT_BATCH_PREFIX = 'SEED-REPO'

type SeedStockConsumptionParams = {
  establishmentId: string
}

async function replenishForWindow(establishmentId: string, from: Date): Promise<void> {
  const required = await db
    .select({
      ingredientId: schema.productIngredients.ingredientId,
      quantity: sql<string>`SUM(${schema.productIngredients.quantity} * ${schema.orderItems.quantity})`,
    })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.productIngredients, eq(schema.productIngredients.productId, schema.orderItems.productId))
    .where(and(
      eq(schema.orders.establishmentId, establishmentId),
      eq(schema.orders.status, 'completed'),
      gte(schema.orders.receivedAt, from),
    ))
    .groupBy(schema.productIngredients.ingredientId)

  const createStockBatchUseCase = new CreateStockBatchUseCase(db, new CreateAuditLogUseCase(db))

  for (const line of required) {
    const batchNumber = `${REPLENISHMENT_BATCH_PREFIX}-${line.ingredientId.slice(-4)}`
    const alreadyReplenished = await db.query.stockBatches.findFirst({
      where: (batches, { eq: equals, and: both }) =>
        both(equals(batches.establishmentId, establishmentId), equals(batches.batchNumber, batchNumber)),
      columns: { id: true },
    })
    if (alreadyReplenished) continue

    const ingredient = await db.query.ingredients.findFirst({
      where: eq(schema.ingredients.id, line.ingredientId),
      columns: { minimumStock: true },
    })

    await createStockBatchUseCase.execute({
      establishmentId,
      ingredientId: line.ingredientId,
      batchNumber,
      quantity: Number(line.quantity) * REPLENISHMENT_SAFETY_FACTOR + Number(ingredient?.minimumStock ?? 0),
      costPerUnit: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
  }
}

export async function seedStockConsumption({ establishmentId }: SeedStockConsumptionParams): Promise<void> {
  const from = new Date(Date.now() - CONSUMPTION_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  await replenishForWindow(establishmentId, from)

  const recentOrders = await db
    .select({ id: schema.orders.id, productionStartedAt: schema.orders.productionStartedAt })
    .from(schema.orders)
    .where(and(
      eq(schema.orders.establishmentId, establishmentId),
      eq(schema.orders.status, 'completed'),
      gte(schema.orders.receivedAt, from),
      isNotNull(schema.orders.productionStartedAt),
    ))

  // O use-case é idempotente por pedido, então rodar o seed de novo não duplica
  // baixa nem derruba o saldo uma segunda vez.
  const deductStock = new DeductStockForOrderUseCase(db)
  for (const order of recentOrders) {
    await deductStock.execute({ orderId: order.id, establishmentId })

    // O movimento nasce com a data de hoje; sem alinhar com o preparo, a baixa
    // de um pedido de anteontem aparece como movimento de agora no histórico.
    if (order.productionStartedAt) {
      await db
        .update(schema.stockMovements)
        .set({ createdAt: order.productionStartedAt })
        .where(eq(schema.stockMovements.orderId, order.id))
    }
  }
}
