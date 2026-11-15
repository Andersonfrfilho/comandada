/**
 * Escolhe produtos para oferecer no lugar de um item em falta: "do mesmo tipo" = mesma categoria do
 * cardápio (ou outro tamanho do mesmo item), com preço parecido. Função pura para ser testada sem banco.
 */

export interface SubstituteCandidate {
  readonly productId: string
  readonly productName: string
  readonly unitPrice: number
  readonly catalogId: string | null
  readonly catalogName: string | null
  readonly variantGroup: string | null
}

export interface SubstituteTarget {
  readonly productId: string | null
  readonly productName: string
  readonly unitPrice: number
  readonly catalogId: string | null
  readonly variantGroup: string | null
}

export const MAX_SUBSTITUTES = 8

// Preço muito acima do item original vira surpresa na conta do cliente: fica fora da lista.
const MAX_PRICE_RATIO = 1.6

export function rankSubstitutes(
  target: SubstituteTarget,
  candidates: readonly SubstituteCandidate[],
  excludedProductIds: ReadonlySet<string> = new Set(),
  limit: number = MAX_SUBSTITUTES
): SubstituteCandidate[] {
  const sameKind = candidates.filter((candidate) => {
    if (candidate.productId === target.productId) return false
    if (excludedProductIds.has(candidate.productId)) return false
    if (normalize(candidate.productName) === normalize(target.productName)) return false
    const sameVariant = Boolean(target.variantGroup) && candidate.variantGroup === target.variantGroup
    const sameCatalog = Boolean(target.catalogId) && candidate.catalogId === target.catalogId
    if (!sameVariant && !sameCatalog) return false
    return target.unitPrice <= 0 || candidate.unitPrice <= target.unitPrice * MAX_PRICE_RATIO
  })

  return sameKind
    .map((candidate) => ({ candidate, score: score(target, candidate) }))
    .sort((left, right) => left.score - right.score || left.candidate.productName.localeCompare(right.candidate.productName, 'pt-BR'))
    .slice(0, limit)
    .map((entry) => entry.candidate)
}

/** Menor = melhor. Outro tamanho do mesmo item vem antes; depois a diferença de preço. */
function score(target: SubstituteTarget, candidate: SubstituteCandidate): number {
  const sameVariant = Boolean(target.variantGroup) && candidate.variantGroup === target.variantGroup
  const priceDistance = Math.abs(candidate.unitPrice - target.unitPrice)
  return (sameVariant ? 0 : 1000) + priceDistance
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}
