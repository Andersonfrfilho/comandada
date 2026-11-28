import type { RecipeCost } from '@adatechnology/recipe-contracts'

import { formatBRL } from '@/lib/listing'

type RecipeCostBadgeProps = {
  /** `undefined` (ou ficha sem linhas) quando o produto não tem ficha técnica. */
  readonly cost: RecipeCost | undefined
  readonly isLoading?: boolean
}

const BASIS_POINTS_PER_PERCENT = 100

export function RecipeCostBadge({ cost, isLoading = false }: RecipeCostBadgeProps) {
  if (isLoading) return null
  if (!cost || cost.lines.length === 0) return <span className="text-xs text-gray-400 italic">Sem ficha técnica</span>

  const margin =
    cost.marginBasisPoints === null ? '-' : `${Math.round(cost.marginBasisPoints / BASIS_POINTS_PER_PERCENT)}%`

  return (
    <span className="text-xs text-gray-500">
      Custo receita {formatBRL(cost.costPerPortionCents / 100)} · Margem {margin}
    </span>
  )
}
