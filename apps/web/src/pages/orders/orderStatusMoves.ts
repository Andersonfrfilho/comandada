import type { OrderStatus } from '@/constants/orderLabels'

// Mesmo fluxo da API (Order.ts): o "próximo passo" não pede confirmação; o resto é correção manual.
const NATURAL_NEXT: Record<OrderStatus, OrderStatus[]> = {
  received: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['in_delivery', 'picked_up', 'completed'],
  in_delivery: ['completed', 'cancelled'],
  picked_up: ['completed'],
  completed: [],
  cancelled: [],
}

export type StatusMoveKind = 'forward' | 'skip' | 'back' | 'cancel' | 'reopen'

/** Que tipo de mudança é ir de `from` para `to`, olhando as etapas do tipo do pedido. */
export function classifyStatusMove(steps: readonly OrderStatus[], from: OrderStatus, to: OrderStatus): StatusMoveKind {
  if (to === 'cancelled') return 'cancel'
  if (from === 'cancelled') return 'reopen'
  if (NATURAL_NEXT[from].includes(to)) return 'forward'
  const fromIndex = steps.indexOf(from)
  const toIndex = steps.indexOf(to)
  if (fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex) return 'back'
  if (from === 'completed') return 'back'
  return 'skip'
}

/**
 * A API só aceita sem `manual` os passos naturais. Cancelar um pedido Pronto, Retirado ou Concluído
 * não é passo natural, então também vai como correção manual (antes dava erro 422 na tela).
 */
export function requiresManualFlag(from: OrderStatus, to: OrderStatus): boolean {
  return !NATURAL_NEXT[from].includes(to)
}

/** Próximo passo natural dentro das etapas do tipo (entrega não oferece "retirado"). */
export function nextStatus(steps: readonly OrderStatus[], current: OrderStatus): OrderStatus | null {
  return NATURAL_NEXT[current].find((status) => status !== 'cancelled' && steps.includes(status)) ?? null
}
