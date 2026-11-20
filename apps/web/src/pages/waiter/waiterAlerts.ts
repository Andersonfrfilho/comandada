import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useQueryClient } from '@tanstack/react-query'
import { useWebSocket } from '@/hooks/useWebSocket'
import { playAlertSound, unlockAlertSound } from '@/lib/alertSound'
import { toast } from '@/stores/toastStore'
import type { TableWithComanda } from '@/constants/tableLabels'
import {
  WAITER_BASE_PATH,
  isTableOrderReady,
  readStatusChange,
  readyNoticeLabel,
  waiterPaths,
  type ReadyNotice,
} from './waiterModel'

const MAX_NOTICES = 30

interface WaiterAlertsState {
  notices: ReadyNotice[]
  add(notice: ReadyNotice): void
  dismiss(orderId: string): void
  clear(): void
}

/** Pedidos prontos para levar à mesa. Fica no aparelho: recarregar o app não some com o aviso. */
export const useWaiterAlertsStore = create<WaiterAlertsState>()(
  persist(
    (set) => ({
      notices: [],
      add: (notice) =>
        set((state) => ({
          notices: [notice, ...state.notices.filter((existing) => existing.orderId !== notice.orderId)].slice(0, MAX_NOTICES),
        })),
      dismiss: (orderId) => set((state) => ({ notices: state.notices.filter((notice) => notice.orderId !== orderId) })),
      clear: () => set({ notices: [] }),
    }),
    { name: 'waiter-ready-notices' }
  )
)

function vibrate(): void {
  try {
    navigator.vibrate?.([200, 100, 200])
  } catch {
    // Sem vibração (iPhone, desktop): o som e o aviso bastam.
  }
}

/**
 * Notificação do sistema pelo service worker: no celular com o app em segundo plano é o único jeito
 * que aparece (o `new Notification` direto não funciona no Chrome do Android).
 */
async function notifySystem(title: string, body: string, url: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, {
        body,
        tag: url,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: { url },
      })
      return
    }
    new Notification(title, { body, tag: url })
  } catch {
    // Navegador sem suporte: fica o aviso na tela.
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

/**
 * Escuta a cozinha: pedido de mesa pronto toca o bipe, vibra, mostra aviso e notificação do sistema,
 * e entra na lista "Prontos para levar". Toda mudança de pedido atualiza mesas e contas abertas.
 */
export function useWaiterAlerts(): void {
  const queryClient = useQueryClient()
  const add = useWaiterAlertsStore((state) => state.add)

  useEffect(() => {
    const unlock = () => unlockAlertSound()
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => document.removeEventListener('pointerdown', unlock)
  }, [])

  useWebSocket((message) => {
    if (message.type === 'comanda:bill_requested' || message.type === 'order:created') {
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      return
    }
    if (message.type !== 'order:status_changed') return
    void queryClient.invalidateQueries({ queryKey: ['tables'] })
    void queryClient.invalidateQueries({ queryKey: ['comanda-bill'] })

    const change = readStatusChange(message.payload)
    if (!change || !isTableOrderReady(change)) return

    const tables = queryClient.getQueryData<TableWithComanda[]>(['tables']) ?? []
    const table = tables.find((candidate) => candidate.id === change.tableId)
    const notice: ReadyNotice = {
      orderId: change.orderId,
      number: change.number ?? null,
      tableId: change.tableId ?? null,
      tableNumber: table?.number ?? null,
      comandaId: change.comandaId ?? null,
      readyAt: new Date().toISOString(),
    }
    add(notice)
    const label = readyNoticeLabel(notice)
    playAlertSound()
    vibrate()
    toast.success(label)
    void notifySystem(label, 'Pode levar para a mesa.', notice.comandaId ? waiterPaths.comanda(notice.comandaId) : WAITER_BASE_PATH)
  })
}
