import { useState } from 'react'
import { Bell } from 'lucide-react'
import { alertCountFor, useAlertsStore } from '@/stores/alertsStore'

/** Contador de pedidos novos / pedidos de atendente no item do menu; `dot` marca o botão do menu no celular. */
export function AlertBadge({ path, dot = false }: { path: string; dot?: boolean }) {
  const newOrders = useAlertsStore((state) => state.newOrders)
  const handoffRequests = useAlertsStore((state) => state.handoffRequests)
  const count = dot ? newOrders + handoffRequests : alertCountFor(path, { newOrders, handoffRequests })
  if (count === 0) return null
  if (dot) {
    return <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-gray-900" aria-label={`${count} avisos`} />
  }
  return (
    <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-center text-xs font-bold leading-5 text-white" aria-label={`${count} novos`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Pede a permissão de notificação do navegador uma vez; some depois de respondida. */
export function BrowserAlertsButton() {
  const [permission, setPermission] = useState(() => (typeof Notification === 'undefined' ? 'denied' : Notification.permission))
  if (permission !== 'default') return null
  return (
    <button
      type="button"
      onClick={() => void Notification.requestPermission().then(setPermission)}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-300 hover:bg-gray-800 rounded-lg transition-colors"
    >
      <Bell className="h-4 w-4" aria-hidden="true" />
      Avisar pedidos com a aba fechada
    </button>
  )
}
