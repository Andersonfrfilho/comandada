import { useMemo } from 'react'
import type { PlannedItemInput, PlannedItemsSource } from '@adatechnology/recipes-ui'

import { addDaysToIsoDate, todayIsoDate } from '@/pages/agenda/agendaDates'
import { api } from '@/lib/api'
import { accessToken } from '@/lib/sdkHttp'

const CANCELLED_STATUS = 'cancelled'
const QUANTITY_SCALE = 4

type AgendaOrder = {
  readonly status: string
  readonly items: readonly { readonly productId: string; readonly quantity: number }[]
}

type AgendaResponse = {
  readonly data: { readonly scheduledOrders: readonly AgendaOrder[] }
}

type SourceRange = {
  readonly id: string
  readonly label: string
  readonly firstDayOffset: number
  readonly dayCount: number
}

const SOURCE_RANGES: readonly SourceRange[] = [
  { id: 'today', label: 'Encomendas de hoje', firstDayOffset: 0, dayCount: 1 },
  { id: 'tomorrow', label: 'Encomendas de amanhã', firstDayOffset: 1, dayCount: 1 },
  { id: 'next-seven-days', label: 'Encomendas dos próximos 7 dias', firstDayOffset: 0, dayCount: 7 },
]

function listDates(range: SourceRange): string[] {
  const today = todayIsoDate()
  return Array.from({ length: range.dayCount }, (_, index) => addDaysToIsoDate(today, range.firstDayOffset + index))
}

function sumQuantitiesByProduct(orders: readonly AgendaOrder[]): PlannedItemInput[] {
  const quantityByProduct = new Map<string, number>()
  for (const order of orders) {
    if (order.status === CANCELLED_STATUS) continue
    for (const item of order.items) {
      quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity)
    }
  }
  // Quatro casas: o `replaceRows` do SDK corta zeros à direita de inteiros ("180" vira "18").
  return [...quantityByProduct].map(([productId, quantity]) => ({ productId, quantity: quantity.toFixed(QUANTITY_SCALE) }))
}

async function loadScheduledOrders(range: SourceRange): Promise<PlannedItemInput[]> {
  const days = await Promise.all(
    listDates(range).map((date) => api.get<AgendaResponse>(`/agenda?date=${date}`, accessToken()))
  )
  return sumQuantitiesByProduct(days.flatMap((day) => day.data.scheduledOrders))
}

/**
 * Origens de quantidade prevista da lista de compras: as encomendas da agenda. Reserva de mesa não
 * tem itens (só mesa e pessoas), então não há o que somar nela.
 */
export function usePlannedItemsSources(): readonly PlannedItemsSource[] {
  return useMemo(
    () => SOURCE_RANGES.map((range) => ({ id: range.id, label: range.label, load: () => loadScheduledOrders(range) })),
    []
  )
}
