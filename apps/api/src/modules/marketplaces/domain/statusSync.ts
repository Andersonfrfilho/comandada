import type { OrderStatus } from '@/shared/types'
import type { MarketplaceAction } from './Marketplace'

export interface StatusSyncOrder {
  /** 'merchant' quando o restaurante entrega; 'platform' quando o entregador é da plataforma. */
  deliveredBy: string | null
  /** Tipo do pedido no painel (delivery, pickup…). */
  type?: string | null | undefined
}

/**
 * Status do painel → ação na plataforma. Entrega pela plataforma não tem "saiu para entrega" nem
 * "entregue": quem leva é o entregador dela. Retirada concluída vira "cliente retirou".
 */
export function actionForStatus(status: OrderStatus, order: StatusSyncOrder): MarketplaceAction | null {
  const merchantDelivers = order.deliveredBy === 'merchant' && order.type !== 'pickup'
  switch (status) {
    case 'in_production':
      return 'startPreparation'
    case 'ready':
      return 'readyForPickup'
    case 'in_delivery':
      return merchantDelivers ? 'dispatch' : null
    case 'completed':
      if (order.type === 'pickup') return 'pickedUp'
      return merchantDelivers ? 'delivered' : null
    default:
      return null
  }
}

/** Ordem das ações: o aviso nunca volta (pronto não reenvia "em preparo"). */
const ACTION_RANK: Record<MarketplaceAction, number> = {
  confirm: 1,
  startPreparation: 2,
  readyForPickup: 3,
  dispatch: 4,
  delivered: 5,
  pickedUp: 5,
}

const PLATFORM_STATUS_RANK: Record<string, number> = {
  placed: 0,
  confirmed: 1,
  confirm: 1,
  startPreparation: 2,
  readyForPickup: 3,
  dispatch: 4,
  delivered: 5,
  pickedUp: 5,
  concluded: 6,
}

const FINAL_STATUSES = new Set(['cancelled', 'concluded'])

/** A ação só sai se for um passo à frente do que a plataforma já sabe. */
export function shouldSendAction(platformStatus: string, action: MarketplaceAction): boolean {
  if (FINAL_STATUSES.has(platformStatus)) return false
  const current = PLATFORM_STATUS_RANK[platformStatus] ?? 1
  return ACTION_RANK[action] > current
}

/**
 * Passos que a plataforma exige antes da ação, na ordem: aceitar antes de tudo e, na entrega
 * própria, "pronto" antes de "saiu para entrega" (regra de homologação do iFood).
 */
export function actionsToSend(platformStatus: string, action: MarketplaceAction): MarketplaceAction[] {
  if (!shouldSendAction(platformStatus, action)) return []
  const current = PLATFORM_STATUS_RANK[platformStatus] ?? 1
  const steps: MarketplaceAction[] = []
  if (current < ACTION_RANK.confirm) steps.push('confirm')
  if ((action === 'dispatch' || action === 'delivered') && current < ACTION_RANK.readyForPickup) steps.push('readyForPickup')
  if (action === 'delivered' && current < ACTION_RANK.dispatch) steps.push('dispatch')
  steps.push(action)
  return steps
}
