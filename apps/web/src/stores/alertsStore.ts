import { create } from 'zustand'

/** Contadores do menu: pedidos novos e clientes pedindo atendente desde a última visita à tela. */
interface AlertsState {
  newOrders: number
  handoffRequests: number
  addOrder(): void
  addHandoff(): void
  clearOrders(): void
  clearHandoffs(): void
}

export const useAlertsStore = create<AlertsState>()((set) => ({
  newOrders: 0,
  handoffRequests: 0,
  addOrder: () => set((state) => ({ newOrders: state.newOrders + 1 })),
  addHandoff: () => set((state) => ({ handoffRequests: state.handoffRequests + 1 })),
  clearOrders: () => set({ newOrders: 0 }),
  clearHandoffs: () => set({ handoffRequests: 0 }),
}))

/** Badge de cada item do menu. */
export function alertCountFor(path: string, state: Pick<AlertsState, 'newOrders' | 'handoffRequests'>): number {
  if (path === '/orders' || path === '/kitchen') return state.newOrders
  if (path === '/conversations') return state.handoffRequests
  return 0
}
