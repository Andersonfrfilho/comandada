import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useCan } from '@/stores/authStore'
import { useAlertsStore } from '@/stores/alertsStore'
import { toast } from '@/stores/toastStore'
import { playAlertSound, playNewOrderSound, unlockAlertSound } from '@/lib/alertSound'

const HELD_PAYMENT_STATUSES = ['awaiting', 'failed']

function payloadField(payload: unknown, field: string): unknown {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[field] : undefined
}

function notifyBrowser(title: string, body: string): void {
  // Aviso do sistema só quando a aba está em segundo plano; com ela aberta, o aviso na tela basta.
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return
  try {
    new Notification(title, { body, tag: title })
  } catch {
    // Alguns navegadores de celular só notificam pelo service worker.
  }
}

/**
 * Pedido novo e cliente pedindo atendente avisam com som, aviso na tela, notificação do navegador
 * (aba em segundo plano) e contador no menu. Antes o pedido chegava e a tela só se redesenhava calada.
 */
export function useOperationAlerts(): void {
  const location = useLocation()
  const watchesOrders = useCan({ resource: 'orders', action: 'write' })
  const watchesKitchen = useCan({ resource: 'kitchen', action: 'read' })
  const watchesConversations = useCan({ resource: 'conversations', action: 'read' })
  const receivesBills = useCan({ resource: 'cashier', action: 'write' })
  const queryClient = useQueryClient()
  const addOrder = useAlertsStore((state) => state.addOrder)
  const addHandoff = useAlertsStore((state) => state.addHandoff)
  const clearOrders = useAlertsStore((state) => state.clearOrders)
  const clearHandoffs = useAlertsStore((state) => state.clearHandoffs)

  useEffect(() => {
    const unlock = () => unlockAlertSound()
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => document.removeEventListener('pointerdown', unlock)
  }, [])

  // Abrir a tela zera o contador dela.
  useEffect(() => {
    if (location.pathname === '/orders' || location.pathname === '/kitchen') clearOrders()
    if (location.pathname === '/conversations') clearHandoffs()
  }, [location.pathname, clearOrders, clearHandoffs])

  useWebSocket((message) => {
    const isNewOrder =
      message.type === 'order:created'
        ? !HELD_PAYMENT_STATUSES.includes(String(payloadField(message.payload, 'paymentStatus') ?? ''))
        : message.type === 'kitchen:order_queued'
    if (isNewOrder && (watchesOrders || watchesKitchen)) {
      const number = payloadField(message.payload, 'number')
      const label = typeof number === 'number' ? `Pedido novo #${number}` : 'Pedido novo'
      playNewOrderSound()
      toast.info(label)
      notifyBrowser(label, 'Chegou um pedido no ComandAdA.')
      const onOrderScreen = location.pathname === '/orders' || location.pathname === '/kitchen'
      if (!onOrderScreen) addOrder()
      return
    }

    // Garçom pediu a conta pelo app: o caixa ouve e a mesa mostra "Conta pedida".
    if (message.type === 'comanda:bill_requested') {
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      if (!receivesBills) return
      const tableNumber = payloadField(message.payload, 'tableNumber')
      const label = typeof tableNumber === 'number' ? `Mesa ${tableNumber} pediu a conta` : 'Mesa pediu a conta'
      playAlertSound()
      toast.info(label)
      notifyBrowser(label, 'Abra Mesas para receber.')
      return
    }

    // iFood/99Food: cliente abriu negociação (prazo curto) ou a plataforma recusou o cancelamento.
    if ((message.type === 'marketplace:dispute_opened' || message.type === 'marketplace:cancellation_failed') && watchesOrders) {
      const platform = String(payloadField(message.payload, 'platform') ?? '')
      const platformLabel = platform === 'ifood' ? 'iFood' : platform === '99food' ? '99Food' : 'Marketplace'
      const displayId = payloadField(message.payload, 'displayId')
      const order = displayId ? ` #${String(displayId)}` : ''
      const label =
        message.type === 'marketplace:dispute_opened'
          ? `${platformLabel}${order}: cliente pediu resposta`
          : `${platformLabel}${order}: cancelamento recusado`
      playAlertSound()
      toast.error(label)
      notifyBrowser(label, 'Abra o pedido para responder.')
      return
    }

    if (message.type === 'conversation:handoff-requested' && watchesConversations) {
      const phone = String(payloadField(message.payload, 'whatsappNumber') ?? '')
      const label = 'Cliente pediu atendente'
      playAlertSound()
      toast.info(phone ? `${label} (final ${phone.slice(-4)})` : label)
      notifyBrowser(label, 'Abra Conversas para responder.')
      if (location.pathname !== '/conversations') addHandoff()
    }
  })
}
