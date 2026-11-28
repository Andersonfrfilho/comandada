import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { MOVEMENT_KIND } from '@adatechnology/stock-contracts'
import { movements, type StockModule } from '@adatechnology/stock-module'

import * as schema from '@/infra/database/schema'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'

type Database = NodePgDatabase<typeof schema>

const DECIMAL_SCALE = 4

export type CreateStockMovementDependencies = {
  readonly db: Database
  readonly stock: StockModule
  readonly createAuditLogUseCase: CreateAuditLogUseCase
  readonly ensureStockEnabled: (establishmentId: string) => Promise<void>
}

export type StockMovementType = 'adjustment' | 'loss'
export type StockMovementDirection = 'increase' | 'decrease'

export interface CreateStockMovementInput {
  establishmentId: string
  ingredientId: string
  movementType: StockMovementType
  direction: StockMovementDirection
  quantity: number
  reason: string
  userId?: string
}

export interface CreateStockMovementResult {
  id: string
  ingredientId: string
  movementType: string
  quantity: string
  reason: string | null
  stockQuantityAfter: string
}

/** Ajuste e perda pelo painel antigo, sobre o módulo de estoque (que exige o motivo e tira de lotes pelo que vence antes). */
export class CreateStockMovementUseCase {
  private readonly db: Database
  private readonly stock: StockModule
  private readonly createAuditLogUseCase: CreateAuditLogUseCase
  private readonly ensureStockEnabled: (establishmentId: string) => Promise<void>

  constructor(dependencies: CreateStockMovementDependencies) {
    this.db = dependencies.db
    this.stock = dependencies.stock
    this.createAuditLogUseCase = dependencies.createAuditLogUseCase
    this.ensureStockEnabled = dependencies.ensureStockEnabled
  }

  async execute(input: CreateStockMovementInput): Promise<CreateStockMovementResult> {
    const { establishmentId, ingredientId } = input
    const actor = input.userId ? { actorId: input.userId } : {}
    // Perda só reduz saldo; ajuste é bidirecional (recontagem pode subir ou descer).
    const effectiveDirection: StockMovementDirection = input.movementType === 'loss' ? 'decrease' : input.direction
    const quantity = input.quantity.toFixed(DECIMAL_SCALE)

    await this.ensureStockEnabled(establishmentId)
    const level =
      input.movementType === 'loss'
        ? await this.stock.useCases.recordLoss.execute({ companyId: establishmentId, ...actor, input: { ingredientId, quantity, reason: input.reason } })
        : await this.stock.useCases.adjustStock.execute({
            companyId: establishmentId,
            ...actor,
            input: { ingredientId, direction: effectiveDirection, quantity, reason: input.reason },
          })

    const kind = input.movementType === 'loss' ? MOVEMENT_KIND.LOSS : MOVEMENT_KIND.ADJUST
    const [movement] = await this.db
      .select({ id: movements.id })
      .from(movements)
      .where(and(eq(movements.companyId, establishmentId), eq(movements.ingredientId, ingredientId), eq(movements.kind, kind)))
      .orderBy(desc(movements.createdAt))
      .limit(1)

    await this.createAuditLogUseCase.execute({
      establishmentId,
      ...actor,
      action: 'stock_movement.created',
      resourceType: 'stock_movement',
      resourceId: movement!.id,
      metadata: {
        ingredientId,
        movementType: input.movementType,
        direction: effectiveDirection,
        quantity: input.quantity,
        reason: input.reason,
      },
    })

    return {
      id: movement!.id,
      ingredientId,
      movementType: input.movementType,
      quantity: effectiveDirection === 'increase' ? quantity : `-${quantity}`,
      reason: input.reason,
      stockQuantityAfter: level.quantity,
    }
  }
}
