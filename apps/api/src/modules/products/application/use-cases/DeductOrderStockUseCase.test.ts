import { describe, expect, it } from 'bun:test'

import { DeductOrderStockUseCase } from './DeductOrderStockUseCase'
import { findActiveOrderDeductions } from './RestoreOrderStockUseCase'

type MovementRow = Parameters<typeof findActiveOrderDeductions>[0][number]

function movement(params: { kind: string; sourceKey: string; at: string }): MovementRow {
  return {
    id: `${params.kind}-${params.at}`,
    companyId: 'company-1',
    ingredientId: 'ingredient-1',
    batchId: null,
    kind: params.kind,
    delta: params.kind === 'out' ? '-1.0000' : '1.0000',
    unit: 'kg',
    reason: 'x',
    actorId: null,
    sourceKey: params.sourceKey,
    createdAt: new Date(params.at),
  }
}

describe('findActiveOrderDeductions', () => {
  it('só conta as baixas depois da última devolução (nova ou migrada)', () => {
    const active = findActiveOrderDeductions([
      movement({ kind: 'out', sourceKey: 'order:o1:i1', at: '2026-11-27T10:00:00Z' }),
      movement({ kind: 'in', sourceKey: 'order-return:o1', at: '2026-11-27T11:00:00Z' }),
      movement({ kind: 'out', sourceKey: 'order:o1:i1', at: '2026-11-27T12:00:00Z' }),
    ])
    expect(active.map((item) => item.createdAt.toISOString())).toEqual(['2026-11-27T12:00:00.000Z'])

    const migrated = findActiveOrderDeductions([
      movement({ kind: 'out', sourceKey: 'order:o1:legacy', at: '2026-11-27T10:00:00Z' }),
      movement({ kind: 'in', sourceKey: 'order:o1:legacy', at: '2026-11-27T11:00:00Z' }),
    ])
    expect(migrated).toEqual([])
  })
})

describe('DeductOrderStockUseCase', () => {
  it('manda uma linha por item do pedido, com o id do item como chave, e o autor da mudança', async () => {
    const calls: unknown[] = []
    const database = {
      select: () => ({
        from: () => ({
          where: async () => [
            { id: 'item-1', productId: 'product-1', quantity: 2 },
            { id: 'item-2', productId: null, quantity: 1 },
          ],
        }),
      }),
    }
    const useCase = new DeductOrderStockUseCase(database as never, {
      execute: async (params) => {
        calls.push(params)
        return { orderId: 'order-1', lines: [], productsWithoutRecipe: [] }
      },
    })

    await useCase.execute({ orderId: 'order-1', establishmentId: 'company-1', userId: 'user-1' })

    expect(calls).toEqual([
      { companyId: 'company-1', actorId: 'user-1', input: { orderId: 'order-1', lines: [{ lineKey: 'item-1', productId: 'product-1', quantity: '2' }] } },
    ])
  })
})
