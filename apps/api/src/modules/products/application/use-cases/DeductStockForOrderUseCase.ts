import { eq, and, gt, asc, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { ConflictError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Product = typeof schema.products.$inferSelect

export interface DeductStockForOrderInput {
  orderId: string
  establishmentId: string
  userId?: string
}

export interface DeductStockForOrderResult {
  alreadyProcessed: boolean
  movementsCreated: number
}

/** Produto cuja receita será consumida, e quantas vezes. */
type ConsumptionLine = {
  product: Product
  quantity: number
}

type ConsumeRecipeParams = {
  transaction: Transaction
  line: ConsumptionLine
  orderId: string
  establishmentId: string
  userId?: string
}

export class DeductStockForOrderUseCase {
  constructor(private readonly db: Database) {}

  /**
   * Kit não tem receita própria: ele vira as receitas dos componentes.
   *
   * A expansão é de um nível só, e é o cadastro que garante isso ao proibir kit
   * dentro de kit — expansão recursiva num ciclo travaria a baixa do pedido.
   */
  private async resolveConsumptionLines(
    transaction: Transaction,
    product: Product,
    itemQuantity: number
  ): Promise<ConsumptionLine[]> {
    if (!product.isKit) return [{ product, quantity: itemQuantity }]

    const components = await transaction.query.productComponents.findMany({
      where: eq(schema.productComponents.kitProductId, product.id),
      with: { component: true },
    })

    return components
      .filter((row) => row.component !== null)
      .map((row) => ({
        product: row.component as Product,
        quantity: row.quantity * itemQuantity,
      }))
  }

  private async consumeRecipe(params: ConsumeRecipeParams): Promise<number> {
    const { transaction, line, orderId, establishmentId, userId } = params

    const recipe = await transaction.query.productIngredients.findMany({
      where: eq(schema.productIngredients.productId, line.product.id),
    })
    if (recipe.length === 0) return 0

    let movementsCreated = 0

    for (const recipeLine of recipe) {
      const requiredQuantity = Number(recipeLine.quantity) * line.quantity

      const ingredient = await transaction.query.ingredients.findFirst({
        where: eq(schema.ingredients.id, recipeLine.ingredientId),
        columns: { name: true },
      })

      const batches = await transaction
        .select()
        .from(schema.stockBatches)
        .where(
          and(
            eq(schema.stockBatches.ingredientId, recipeLine.ingredientId),
            eq(schema.stockBatches.establishmentId, establishmentId),
            gt(schema.stockBatches.remainingQuantity, '0')
          )
        )
        .orderBy(asc(schema.stockBatches.expiresAt))

      let remainingToConsume = requiredQuantity

      for (const batch of batches) {
        if (remainingToConsume <= 0) break

        const batchRemaining = Number(batch.remainingQuantity)
        const consumeFromBatch = Math.min(batchRemaining, remainingToConsume)

        await transaction
          .update(schema.stockBatches)
          .set({
            remainingQuantity: String(batchRemaining - consumeFromBatch),
            updatedAt: new Date(),
          })
          .where(eq(schema.stockBatches.id, batch.id))

        await transaction.insert(schema.stockMovements).values({
          establishmentId,
          ingredientId: recipeLine.ingredientId,
          batchId: batch.id,
          orderId,
          movementType: 'out',
          quantity: String(consumeFromBatch),
          reason: `Baixa por pedido ${orderId}`,
          ...(userId ? { userId } : {}),
        })
        movementsCreated += 1

        remainingToConsume -= consumeFromBatch
      }

      if (remainingToConsume > 0) {
        if (!line.product.allowNegativeStock) {
          throw new ConflictError(
            `Estoque insuficiente para o ingrediente ${ingredient?.name ?? recipeLine.ingredientId} do produto ${line.product.name}`
          )
        }

        await transaction.insert(schema.stockMovements).values({
          establishmentId,
          ingredientId: recipeLine.ingredientId,
          orderId,
          movementType: 'out',
          quantity: String(remainingToConsume),
          reason: `Baixa por pedido ${orderId} — saldo negativo permitido para ${line.product.name}`,
          ...(userId ? { userId } : {}),
        })
        movementsCreated += 1
      }

      await transaction
        .update(schema.ingredients)
        .set({
          stockQuantity: sql`${schema.ingredients.stockQuantity} - ${requiredQuantity}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.ingredients.id, recipeLine.ingredientId))
    }

    return movementsCreated
  }

  async execute(input: DeductStockForOrderInput): Promise<DeductStockForOrderResult> {
    const alreadyProcessed = await this.db.query.stockMovements.findFirst({
      where: and(
        eq(schema.stockMovements.orderId, input.orderId),
        eq(schema.stockMovements.movementType, 'out')
      ),
      columns: { id: true },
    })
    if (alreadyProcessed) return { alreadyProcessed: true, movementsCreated: 0 }

    const items = await this.db.query.orderItems.findMany({
      where: eq(schema.orderItems.orderId, input.orderId),
    })

    let movementsCreated = 0

    await this.db.transaction(async (transaction) => {
      for (const item of items) {
        if (!item.productId) continue

        const product = await transaction.query.products.findFirst({
          where: and(
            eq(schema.products.id, item.productId),
            eq(schema.products.establishmentId, input.establishmentId)
          ),
        })
        if (!product) continue

        const lines = await this.resolveConsumptionLines(transaction, product, item.quantity)

        for (const line of lines) {
          movementsCreated += await this.consumeRecipe({
            transaction,
            line,
            orderId: input.orderId,
            establishmentId: input.establishmentId,
            ...(input.userId ? { userId: input.userId } : {}),
          })
        }
      }
    })

    return { alreadyProcessed: false, movementsCreated }
  }
}
