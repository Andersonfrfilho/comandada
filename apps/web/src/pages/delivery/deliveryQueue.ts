/**
 * Organização da fila de Entregas: em que grupo cada entrega fica, em que ordem, e quanto falta para a
 * hora prometida ao cliente. Fica fora do componente para ser testada sem tela.
 */

export type DeliveryGroupKey = 'on_route' | 'ready' | 'kitchen'

export interface QueueDelivery {
  status: 'pending' | 'dispatched' | 'delivered' | 'failed'
  dispatchedAt?: string | null
  createdAt?: string | null
  order: {
    status?: string | null
    estimatedAt: string | null
    scheduledFor: string | null
    createdAt?: string | null
  }
}

export const DELIVERY_GROUP_ORDER: readonly DeliveryGroupKey[] = ['on_route', 'ready', 'kitchen']

export const DELIVERY_GROUP_LABELS: Record<DeliveryGroupKey, { title: string; summary: (count: number) => string }> = {
  on_route: { title: 'Em rota', summary: (count) => `${count} em rota` },
  ready: { title: 'Prontos para sair', summary: (count) => (count === 1 ? '1 pronto' : `${count} prontos`) },
  kitchen: { title: 'Ainda na cozinha', summary: (count) => `${count} na cozinha` },
}

/** Em rota = saiu; pronto = a cozinha terminou; o resto ainda está sendo feito. */
export function deliveryGroup(delivery: QueueDelivery): DeliveryGroupKey {
  if (delivery.status === 'dispatched') return 'on_route'
  if (delivery.order.status === 'ready') return 'ready'
  return 'kitchen'
}

/** Hora que importa para o entregador: a da encomenda ou a previsão prometida. */
export function promisedAt(delivery: QueueDelivery): string | null {
  return delivery.order.scheduledFor ?? delivery.order.estimatedAt ?? null
}

function timeOf(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

/** Mais urgente primeiro (hora prometida mais cedo); sem previsão, quem entrou antes. */
function compareUrgency(left: QueueDelivery, right: QueueDelivery): number {
  const byPromise = timeOf(promisedAt(left)) - timeOf(promisedAt(right))
  if (byPromise !== 0 && !Number.isNaN(byPromise)) return byPromise
  return timeOf(left.order.createdAt ?? left.createdAt) - timeOf(right.order.createdAt ?? right.createdAt)
}

export function groupDeliveries<T extends QueueDelivery>(deliveries: readonly T[]): Record<DeliveryGroupKey, T[]> {
  const groups: Record<DeliveryGroupKey, T[]> = { on_route: [], ready: [], kitchen: [] }
  for (const delivery of deliveries) groups[deliveryGroup(delivery)].push(delivery)
  for (const key of DELIVERY_GROUP_ORDER) groups[key].sort(compareUrgency)
  return groups
}

export type DeadlineTone = 'late' | 'soon' | 'ok'

export interface Deadline {
  label: string
  tone: DeadlineTone
}

const SOON_MINUTES = 10

/** "Atrasado 4 min", "Faltam 12 min", "Para 19:30": o entregador lê o prazo sem fazer conta. */
export function deliveryDeadline(delivery: QueueDelivery, now: number, formatClock: (value: string) => string): Deadline | null {
  const promised = promisedAt(delivery)
  if (!promised) return null
  const minutesLeft = Math.round((new Date(promised).getTime() - now) / 60_000)
  if (Number.isNaN(minutesLeft)) return null
  if (minutesLeft < 0) return { label: `Atrasado ${formatSpan(-minutesLeft)}`, tone: 'late' }
  if (minutesLeft > 90) return { label: `Para ${formatClock(promised)}`, tone: 'ok' }
  return { label: `Faltam ${formatSpan(minutesLeft)}`, tone: minutesLeft <= SOON_MINUTES ? 'soon' : 'ok' }
}

/** "Saiu há 18 min": quanto tempo o pedido está na rua. */
export function sinceLabel(value: string | null | undefined, now: number): string | null {
  if (!value) return null
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60_000))
  if (Number.isNaN(minutes)) return null
  return minutes === 0 ? 'agora' : `há ${formatSpan(minutes)}`
}

function formatSpan(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** Link do WhatsApp do cliente (wa.me) para quem não tem a tela de Conversas. */
export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`
}

export function telUrl(phone: string): string {
  return `tel:+${phone.replace(/\D/g, '')}`
}
