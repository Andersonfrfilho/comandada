import type { OrderStatus } from '@/shared/types'
import type { MarketplaceAction } from './Marketplace'

/**
 * Status do painel → ação na plataforma. Retirada e entrega pela plataforma não têm "saiu para entrega"
 * nem "entregue": quem leva é o entregador dela.
 */
export function actionForStatus(
  status: OrderStatus,
  deliveredBy: string | null
): MarketplaceAction | null {
  const merchantDelivers = deliveredBy === 'merchant'
  switch (status) {
    case 'in_production':
      return 'startPreparation'
    case 'ready':
      return 'readyForPickup'
    case 'in_delivery':
      return merchantDelivers ? 'dispatch' : null
    case 'completed':
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
}

const PLATFORM_STATUS_RANK: Record<string, number> = {
  placed: 0,
  confirm: 1,
  startPreparation: 2,
  readyForPickup: 3,
  dispatch: 4,
  delivered: 5,
  concluded: 6,
  cancelled: 7,
}

/** A ação só sai se for um passo à frente do que a plataforma já sabe. */
export function shouldSendAction(platformStatus: string, action: MarketplaceAction): boolean {
  const current = PLATFORM_STATUS_RANK[platformStatus] ?? 0
  if (platformStatus === 'cancelled' || platformStatus === 'concluded') return false
  return ACTION_RANK[action] > current
}
