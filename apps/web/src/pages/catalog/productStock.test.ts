import { describe, expect, test } from 'bun:test'
import { hasUnitMismatch, portionsAvailable, portionsFromIngredient } from './productStock'

describe('portionsFromIngredient', () => {
  test('rende porções inteiras do saldo', () => {
    expect(portionsFromIngredient({ stockQuantity: 2, stockUnit: 'kg', quantityPerPortion: 0.15, recipeUnit: 'kg' })).toBe(13)
    expect(portionsFromIngredient({ stockQuantity: 0.3, stockUnit: 'kg', quantityPerPortion: 0.1, recipeUnit: 'kg' })).toBe(3)
  })

  test('saldo negativo vira zero', () => {
    expect(portionsFromIngredient({ stockQuantity: -3, stockUnit: 'un', quantityPerPortion: 1, recipeUnit: 'un' })).toBe(0)
  })

  test('sem quantidade na ficha não calcula', () => {
    expect(portionsFromIngredient({ stockQuantity: 5, stockUnit: 'un', quantityPerPortion: 0, recipeUnit: 'un' })).toBeNull()
  })
})

describe('portionsAvailable', () => {
  test('o ingrediente que acaba primeiro manda', () => {
    expect(
      portionsAvailable([
        { stockQuantity: 1, stockUnit: 'kg', quantityPerPortion: 0.1, recipeUnit: 'kg' },
        { stockQuantity: 4, stockUnit: 'un', quantityPerPortion: 1, recipeUnit: 'un' },
      ])
    ).toBe(4)
  })

  test('sem linha calculável não diz nada', () => {
    expect(portionsAvailable([])).toBeNull()
  })
})

describe('hasUnitMismatch', () => {
  test('marca unidade da ficha diferente da do ingrediente', () => {
    expect(hasUnitMismatch({ stockQuantity: 1, stockUnit: 'kg', quantityPerPortion: 150, recipeUnit: 'g' })).toBe(true)
    expect(hasUnitMismatch({ stockQuantity: 1, stockUnit: 'kg', quantityPerPortion: 0.15, recipeUnit: 'kg' })).toBe(false)
  })
})
