import type { KitchenTimeProfile } from '@/modules/orders/application/use-cases/EstimateOrderTimeUseCase'

/**
 * Ordem sugerida para a cozinha: quem precisa COMEÇAR primeiro vem primeiro.
 *
 * Cada pedido tem uma hora em que precisa estar pronto no balcão:
 * - encomenda: a hora marcada;
 * - pedido com previsão dada ao cliente: a previsão;
 * - sem previsão (mesa, balcão): chegada + o tempo de preparo padrão da casa (ou o do item, se for maior)
 *   (+ rua, na entrega). Assim um temaki de mesa não "atrasa" no segundo em que chega.
 * Na entrega, a hora de ficar pronto desconta o tempo de rua. A hora de começar é essa hora menos o
 * preparo do item mais demorado que ainda não ficou pronto. A fila ordena pela hora de começar.
 */

export const KITCHEN_PRIORITY_THRESHOLDS = {
  /** Folga até aqui (minutos) já pede para começar. */
  nowMinutes: 5,
  /** Folga até aqui é "em breve". */
  soonMinutes: 15,
} as const

export type KitchenUrgency = 'late' | 'now' | 'soon' | 'ok'

/** De onde veio a hora de ficar pronto. */
export type KitchenDeadlineSource = 'scheduled' | 'promised' | 'estimated'

export interface KitchenPriorityItem {
  readonly productId: string | null
  readonly readyAt: Date | string | null
}

export interface KitchenPriorityOrder {
  readonly id: string
  readonly type: string
  readonly status: string
  readonly receivedAt: Date | string
  readonly scheduledFor: Date | string | null
  readonly estimatedAt: Date | string | null
  readonly productionStartedAt: Date | string | null
  /** Momento em que o pedido entrou na fila (encomenda entra perto da hora). */
  readonly releasedAt: number
  readonly items: readonly KitchenPriorityItem[]
}

export interface KitchenPriority {
  /** Preparo que falta: o item mais demorado ainda não pronto. */
  readonly preparationMinutes: number
  /** Tempo de rua descontado (0 fora da entrega). */
  readonly routeMinutes: number
  readonly deadlineSource: KitchenDeadlineSource
  /** Hora em que precisa estar pronto no balcão. */
  readonly readyBy: string
  /** Hora limite para começar sem atrasar. */
  readonly startBy: string
  /** Minutos até a hora de começar (negativo: já devia ter começado). */
  readonly slackMinutes: number
  readonly urgency: KitchenUrgency
  /** Posição sugerida entre os pedidos aguardando (1 = próximo); null para os já em preparo. */
  readonly position: number | null
  /** Selo "Fazer agora". */
  readonly doNow: boolean
}

const MINUTE = 60_000

function toTime(value: Date | string): number {
  return new Date(value).getTime()
}

function remainingPreparationMinutes(order: KitchenPriorityOrder, profile: KitchenTimeProfile, now: number): number {
  const pending = order.items.filter((item) => !item.readyAt)
  if (order.items.length > 0 && pending.length === 0) return 0
  const minutes = pending.map((item) =>
    item.productId ? (profile.productMinutes.get(item.productId) ?? profile.defaultPreparationMinutes) : profile.defaultPreparationMinutes
  )
  const longest = minutes.length > 0 ? Math.max(...minutes) : profile.defaultPreparationMinutes
  if (order.status !== 'in_production' || !order.productionStartedAt) return longest
  // Já começou: só falta o que não passou.
  const elapsed = (now - toTime(order.productionStartedAt)) / MINUTE
  return Math.max(0, Math.round(longest - elapsed))
}

export function urgencyFor(slackMinutes: number): KitchenUrgency {
  if (slackMinutes < 0) return 'late'
  if (slackMinutes <= KITCHEN_PRIORITY_THRESHOLDS.nowMinutes) return 'now'
  if (slackMinutes <= KITCHEN_PRIORITY_THRESHOLDS.soonMinutes) return 'soon'
  return 'ok'
}

export function computeKitchenPriority(
  order: KitchenPriorityOrder,
  profile: KitchenTimeProfile,
  now: number
): Omit<KitchenPriority, 'position' | 'doNow'> {
  const isDelivery = order.type === 'delivery'
  const routeMinutes = isDelivery ? profile.deliveryMinutes : 0
  // Preparo cheio (para a previsão) e o que ainda falta (para a hora de começar).
  const fullPreparation = remainingPreparationMinutes({ ...order, status: 'received' }, profile, now)
  const preparationMinutes = remainingPreparationMinutes(order, profile, now)

  let deadlineSource: KitchenDeadlineSource
  let customerTime: number
  if (order.scheduledFor) {
    deadlineSource = 'scheduled'
    customerTime = toTime(order.scheduledFor)
  } else if (order.estimatedAt) {
    deadlineSource = 'promised'
    customerTime = toTime(order.estimatedAt)
  } else {
    deadlineSource = 'estimated'
    const target = Math.max(fullPreparation, profile.defaultPreparationMinutes)
    customerTime = toTime(order.receivedAt) + (target + routeMinutes) * MINUTE
  }

  const readyBy = customerTime - routeMinutes * MINUTE
  const startBy =
    order.status === 'in_production' ? readyBy - preparationMinutes * MINUTE : readyBy - fullPreparation * MINUTE
  // Em preparo, a "hora de começar" vira a hora de terminar menos o que falta: a folga é o mesmo cálculo.
  const slackMinutes = Math.floor((startBy - now) / MINUTE)

  return {
    preparationMinutes,
    routeMinutes,
    deadlineSource,
    readyBy: new Date(readyBy).toISOString(),
    startBy: new Date(startBy).toISOString(),
    slackMinutes,
    urgency: urgencyFor(slackMinutes),
  }
}

/**
 * Ordena a fila e marca o que fazer agora. Em preparo fica antes (já está na bancada), depois os aguardando
 * pela hora de começar; empate fica com quem espera há mais tempo.
 */
export function rankKitchenOrders<Order extends KitchenPriorityOrder>(
  orders: readonly Order[],
  profile: KitchenTimeProfile,
  now: number
): Array<Order & { priority: KitchenPriority }> {
  const scored = orders.map((order) => ({ order, base: computeKitchenPriority(order, profile, now) }))
  const byStart = (
    first: (typeof scored)[number],
    second: (typeof scored)[number]
  ): number => toTime(first.base.startBy) - toTime(second.base.startBy) || first.order.releasedAt - second.order.releasedAt

  const inProduction = scored.filter((entry) => entry.order.status === 'in_production').sort(byStart)
  const waiting = scored.filter((entry) => entry.order.status !== 'in_production').sort(byStart)

  const rankedWaiting = waiting.map((entry, index) => ({
    ...entry.order,
    priority: {
      ...entry.base,
      position: index + 1,
      // O primeiro da fila é sempre o próximo; os outros só quando a folga acabou.
      doNow: index === 0 || entry.base.urgency === 'late' || entry.base.urgency === 'now',
    },
  }))
  const rankedInProduction = inProduction.map((entry) => ({
    ...entry.order,
    priority: { ...entry.base, position: null, doNow: false },
  }))
  return [...rankedInProduction, ...rankedWaiting]
}
