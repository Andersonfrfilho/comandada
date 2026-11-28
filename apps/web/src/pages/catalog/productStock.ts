// Estoque do produto = estoque dos ingredientes da ficha técnica. O produto em si não tem saldo
// (estoque mora por insumo), então a página de detalhe mostra quantas
// porções o saldo atual dos ingredientes ainda rende.
//
// O módulo de estoque converte a unidade da ficha para a do insumo antes de baixar; quem chama
// já entrega `quantityPerPortion` na unidade do insumo.

export interface RecipeStockLine {
  /** Saldo do ingrediente, na unidade do ingrediente. */
  stockQuantity: number
  stockUnit: string
  /** Quanto uma porção do produto baixa do ingrediente. */
  quantityPerPortion: number
  recipeUnit: string
}

/** Porções inteiras que o saldo de um ingrediente rende; `null` sem quantidade na ficha. */
export function portionsFromIngredient(line: RecipeStockLine): number | null {
  if (!(line.quantityPerPortion > 0)) return null
  return Math.max(0, Math.floor(line.stockQuantity / line.quantityPerPortion + 1e-9))
}

/** O ingrediente que acaba primeiro manda: menor rendimento entre as linhas que dá para calcular. */
export function portionsAvailable(lines: readonly RecipeStockLine[]): number | null {
  const portions = lines.map(portionsFromIngredient).filter((value): value is number => value !== null)
  return portions.length === 0 ? null : Math.min(...portions)
}
