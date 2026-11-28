import { describe, expect, it } from 'bun:test'
import type { Recipe } from '@adatechnology/recipe-contracts'

import { buildKitRecipes } from './kitRecipes'

const COMPANY_ID = 'company-1'

function recipe(params: { productId: string; yieldPortions?: string; lines: { ingredientId: string; quantity: string; unit: 'kg' | 'un' }[] }): Recipe {
  return {
    id: `recipe-${params.productId}`,
    companyId: COMPANY_ID,
    productId: params.productId,
    yieldPortions: params.yieldPortions ?? '1',
    preparationTimeMinutes: null,
    instructions: '',
    lines: params.lines.map((line, position) => ({ id: `${params.productId}-${position}`, notes: null, position, ...line })),
    createdAt: '2026-11-27T00:00:00.000Z',
    updatedAt: '2026-11-27T00:00:00.000Z',
  }
}

describe('buildKitRecipes', () => {
  const cake = recipe({ productId: 'cake', lines: [{ ingredientId: 'flour', quantity: '0.2', unit: 'kg' }, { ingredientId: 'egg', quantity: '2', unit: 'un' }] })
  const bread = recipe({ productId: 'bread', yieldPortions: '4', lines: [{ ingredientId: 'flour', quantity: '0.4', unit: 'kg' }] })
  const recipesByProductId = new Map([[cake.productId, cake], [bread.productId, bread]])

  it('soma os insumos dos componentes (quantidade do componente / rendimento) numa ficha de rendimento 1', () => {
    const [kit] = buildKitRecipes({
      companyId: COMPANY_ID,
      recipesByProductId,
      components: [
        { kitProductId: 'combo', componentProductId: 'cake', quantity: 1 },
        { kitProductId: 'combo', componentProductId: 'bread', quantity: 2 },
      ],
    })

    expect(kit).toMatchObject({ productId: 'combo', yieldPortions: '1' })
    const byIngredient = Object.fromEntries(kit!.lines.map((line) => [line.ingredientId, line.quantity]))
    // 0,2 do bolo + 2 x (0,4 / 4) do pão = 0,4 kg de farinha; 2 ovos.
    expect(byIngredient).toEqual({ flour: '0.4000', egg: '2.0000' })
  })

  it('componente sem ficha não entra, e combo sem nenhuma ficha de componente fica sem ficha', () => {
    const kits = buildKitRecipes({
      companyId: COMPANY_ID,
      recipesByProductId,
      components: [
        { kitProductId: 'combo-vazio', componentProductId: 'refrigerante', quantity: 1 },
        { kitProductId: 'combo-misto', componentProductId: 'refrigerante', quantity: 1 },
        { kitProductId: 'combo-misto', componentProductId: 'cake', quantity: 2 },
      ],
    })

    expect(kits.map((kit) => kit.productId)).toEqual(['combo-misto'])
    expect(kits[0]!.lines.map((line) => line.quantity)).toEqual(['0.4000', '4.0000'])
  })
})
