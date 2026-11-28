import { eq, and, gte, like, sql, isNotNull } from 'drizzle-orm'
import { db } from '../connection'
import * as schema from '../schema'
import { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { CreateStockBatchUseCase } from '@/modules/products/application/use-cases/CreateStockBatchUseCase'
import { DeductOrderStockUseCase } from '@/modules/products/application/use-cases/DeductOrderStockUseCase'
import { recipeModule, stockModule } from '@/infra/recipes/recipeStockModules'
import { ensureStockEnabledForCompany } from '@/infra/recipes/stockEnabled'
import { ORDER_DEDUCTION_KEY_PREFIX } from '@/modules/products/shared/orderStockMovements'
import { movements } from '@adatechnology/stock-module'

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
      productId: schema.orderItems.productId,
      quantity: sql<string>`SUM(${schema.orderItems.quantity})`,
    })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .where(and(
      eq(schema.orders.establishmentId, establishmentId),
      eq(schema.orders.status, 'completed'),
      gte(schema.orders.receivedAt, from),
    ))
    .groupBy(schema.orderItems.productId)

  const soldByProduct = new Map(required.flatMap((row) => (row.productId ? [[row.productId, Number(row.quantity)] as const] : [])))
  const { recipes, ingredients } = await recipeModule.useCases.lookupRecipes.execute({ companyId: establishmentId, productIds: [...soldByProduct.keys()] })
  const quantityByIngredient = new Map<string, number>()
  for (const recipe of recipes) {
    for (const line of recipe.lines) {
      const needed = Number(line.quantity) * (soldByProduct.get(recipe.productId) ?? 0)
      quantityByIngredient.set(line.ingredientId, (quantityByIngredient.get(line.ingredientId) ?? 0) + needed)
    }
  }

  const createStockBatchUseCase = new CreateStockBatchUseCase({ db, recipes: recipeModule, stock: stockModule, createAuditLogUseCase: new CreateAuditLogUseCase(db), ensureStockEnabled: ensureStockEnabledForCompany })

  for (const ingredient of ingredients) {
    const quantity = quantityByIngredient.get(ingredient.id)
    if (quantity === undefined) continue
    const batchNumber = `${REPLENISHMENT_BATCH_PREFIX}-${ingredient.id.slice(-4)}`
    const batches = await stockModule.useCases.listBatches.execute({
      companyId: establishmentId,
      query: { ingredientId: ingredient.id, onlyWithRemaining: false, page: 1, pageSize: 100 },
    })
    if (batches.data.some((batch) => batch.batchCode === batchNumber)) continue

    const level = await stockModule.useCases.getLevel.execute({ companyId: establishmentId, ingredientId: ingredient.id })

    await createStockBatchUseCase.execute({
      establishmentId,
      ingredientId: ingredient.id,
      batchNumber,
      quantity: quantity * REPLENISHMENT_SAFETY_FACTOR + Number(level.minimumQuantity ?? 0),
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
  const deductStock = new DeductOrderStockUseCase(db, stockModule.useCases.deductOrder)
  for (const order of recentOrders) {
    await deductStock.execute({ orderId: order.id, establishmentId })

    // O movimento nasce com a data de hoje; sem alinhar com o preparo, a baixa
    // de um pedido de anteontem aparece como movimento de agora no histórico.
    if (order.productionStartedAt) {
      await db
        .update(movements)
        .set({ createdAt: order.productionStartedAt })
        .where(and(eq(movements.companyId, establishmentId), like(movements.sourceKey, `${ORDER_DEDUCTION_KEY_PREFIX}${order.id}:%`)))
    }
  }
}
